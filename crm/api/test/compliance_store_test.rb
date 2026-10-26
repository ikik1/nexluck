require 'minitest/autorun'
require 'json'
require 'date'
require 'time'
require 'securerandom'
require 'webrick'
require_relative '../customers'
require_relative '../game_catalog'
CustomerStore.include(GameCatalog)
require_relative '../casino_context'

# Exercise the real tenant and context transaction without CustomerStore's legacy
# initialization, which intentionally forbids storing production data in the web root.
class ComplianceStoreTest < Minitest::Test
  Request = Struct.new(:request_method, :headers, :body, :attributes) do
    def [](key)
      headers[key]
    end

    def content_type
      self['Content-Type']
    end
  end

  def setup
    @mode = ENV['CRM_UI_MODE']
    ENV['CRM_UI_MODE'] = 'demo'
    @context = CasinoContext.allocate
    @a, @b = 'CS-1111111111111111', 'CS-2222222222222222'
    @state = @context.empty_state
    ComplianceStore.prepare(@state, @a, demo: false)
    @tenant = CasinoContext::Tenant.new(@state, @a, [])
  end

  def teardown
    ENV['CRM_UI_MODE'] = @mode
    FileUtils.remove_entry(@directory) if @directory
  end

  def call(path = 'compliance', method = 'GET', body = nil)
    req = Request.new(method, { 'Content-Type' => 'application/json' }, body && JSON.generate(body), { 'operator' => 'test-staff' })
    res = WEBrick::HTTPResponse.new(WEBrick::Config::HTTP)
    @tenant.handle_compliance(req, res, path)
    [res.status, JSON.parse(res.body)]
  end

  def seed
    ComplianceStore.prepare(@state, @a)
  end

  def test_lazy_seeding_and_demo_only_profiles_without_credentials_or_ledger
    assert_empty @state['profiles']
    assert_empty @tenant.segments
    assert_empty call('compliance/risk-matrix')[1]['entries']
    seed
    data = call[1]
    assert_equal [24, 29, 30], ComplianceStore::COLLECTIONS.map { |key| data[key].length }
    assert data['demo']
    assert data.values.grep(Array).flatten.grep(Hash).select { |row| row['status'] }.all? { |row| ComplianceStore::STATUSES.include?(row['status']) && row['demo'] && row['casino_id'] == @a }
    assert_equal [15, 20, 30], ComplianceStore::COLLECTIONS.map { |key| data[key].count { |row| row['status'] == 'New' } }
    %w[payouts kyc_requests].each do |key|
      assert_equal %w[Approved Declined New Pending], data[key].map { |row| row['status'] }.uniq.sort
    end
    assert_equal 12, @tenant.list.length
    assert_empty @state['credentials']
    assert_empty @state['finance']['wallet_transactions']
    @tenant.list.each do |profile|
      assert profile['id'].match?(/\ACU-\d+\z/)
      assert_equal @a, profile['casino_id']
      assert_equal 'Synthetic compliance demo profile. No credentials or financial ledger.', profile['info']
    end
    assert data['kyc_requests'].all? { |row| row['preview_url'] == '/coml/demo-document.svg' }
    assert data['alerts'].all? { |row| row['last_session']['ip'].start_with?('192.0.2.') }
    snapshot = JSON.generate(@state)
    refute seed
    assert_equal snapshot, JSON.generate(@state)
    restored = JSON.parse(snapshot)
    refute ComplianceStore.prepare(restored, @a)
    assert_equal @state, restored
    other = @context.empty_state
    ComplianceStore.prepare(other, @b)
    refute_equal @state['profiles'].keys, other['profiles'].keys
    assert_empty(@state['profiles'].keys & other['profiles'].keys)
    assert_empty(@state['compliance']['payouts'].map { |row| row['id'] } & other['compliance']['payouts'].map { |row| row['id'] })
  end

  def test_authenticated_mode_never_creates_demo_records
    ENV['CRM_UI_MODE'] = 'authenticated'
    refute ComplianceStore.prepare(@state, @a)
    assert_empty @state['profiles']
    assert_empty @tenant.compliance['payouts']
    refute @tenant.compliance['demo']
  end

  def test_review_examples_upgrade_preserves_existing_decisions
    seed
    compliance = @tenant.compliance
    compliance.delete('review_examples_seeded')
    %w[payouts kyc_requests].each { |key| compliance[key].reject! { |row| row['id'].match?(/-(PENDING|APPROVED|DECLINED)-\d+\z/) } }
    compliance['payouts'].first['status'] = 'Approved'
    assert seed
    assert_equal 'Approved', compliance['payouts'].first['status']
    assert_equal 24, compliance['payouts'].length
    snapshot = JSON.generate(@state)
    refute seed
    assert_equal snapshot, JSON.generate(@state)
    compliance.delete('review_examples_seeded')
    ENV['CRM_UI_MODE'] = 'authenticated'
    refute seed
  end

  def test_internal_block_is_owned_idempotent_and_does_not_change_aml_or_finance
    seed
    customer = @tenant.list.first
    aml = customer['aml_status']
    finance = JSON.generate(@state['finance'])
    path = "compliance/customers/#{customer['id']}/block"
    assert_equal 405, call(path)[0]
    assert_equal 422, call(path, 'POST', { 'status' => 'Blocked' })[0]
    status, blocked = call(path, 'POST', {})
    assert_equal 200, status
    assert blocked['compliance_blocked']
    assert_equal 'test-staff', blocked['compliance_blocked_by']
    assert_equal aml, blocked['aml_status']
    assert_equal finance, JSON.generate(@state['finance'])
    assert_equal blocked, call(path, 'POST', {})[1]
    assert_equal 404, call('compliance/customers/CU-999/block', 'POST', {})[0]
  end

  def test_example_segments_are_valid_and_matrix_scores_are_casino_local_and_atomic
    seed
    @tenant.segments.each do |segment|
      _, errors = CustomerSegments.validate(segment.slice('name', 'rules'), @tenant.parameters)
      assert_empty errors
    end
    assert_equal [10, 40, 50], @tenant.segments.map { |segment| segment['risk_score'] }.sort
    assert_equal ['Country login', 'M ip login', 'bonus wager'], @tenant.segments.map { |segment| segment['tag_name'] }.sort
    id = @tenant.segments.first['id']
    before = @tenant.compliance['risk_matrix'].dup
    [
      [{ 'segment_id' => id, 'score' => 1.5 }],
      [{ 'segment_id' => id, 'score' => 101 }],
      [{ 'segment_id' => id, 'score' => -1 }],
      [{ 'segment_id' => id, 'score' => true }],
      [{ 'segment_id' => id, 'score' => 1 }, { 'segment_id' => id, 'score' => 2 }],
      [{ 'segment_id' => 'SG-foreign', 'score' => 10 }],
      [{ 'segment_id' => id, 'score' => 10, 'casino_id' => @b }]
    ].each do |entries|
      assert_equal 422, call('compliance/risk-matrix', 'PATCH', { 'entries' => entries })[0]
      assert_equal before, @tenant.compliance['risk_matrix']
    end
    status, result = call('compliance/risk-matrix', 'PATCH', { 'entries' => [{ 'segment_id' => id, 'score' => 0 }] })
    assert_equal 200, status
    assert_equal 0, @tenant.segment(id)['risk_score']
    assert_equal 1, result['entries'].length
    assert @tenant.segments.all? { |segment| segment['risk_score'] == 0 }
  end

  def test_review_transitions_audit_and_no_payout_execution
    seed
    payout = @tenant.compliance['payouts'].first
    finance = JSON.generate(@state['finance'])
    path = "compliance/payouts/#{payout['id']}"
    assert_equal 422, call(path, 'PATCH', { 'status' => 'Executed' })[0]
    assert_equal 422, call(path, 'PATCH', { 'status' => 'Pending', 'amount' => 999 })[0]
    assert_equal 200, call(path, 'PATCH', { 'status' => 'Pending' })[0]
    assert_equal 200, call(path, 'PATCH', { 'status' => 'Approved' })[0]
    assert_equal 200, call(path, 'PATCH', { 'status' => 'Approved' })[0]
    assert_equal 409, call(path, 'PATCH', { 'status' => 'Declined' })[0]
    assert_equal %w[Pending Approved], payout['audit'].map { |event| event['to'] }
    assert_equal ['test-staff'], payout['audit'].map { |event| event['by'] }.uniq
    assert_equal finance, JSON.generate(@state['finance'])
  end

  def test_segment_edit_preserves_omitted_tag_and_clears_explicit_blank_or_null
    seed
    segment = @tenant.segments.first
    id = segment['id']
    body = segment.slice('name', 'rules')
    saved, errors = @tenant.save_segment(id, body.merge('name' => 'Edited risk segment'))
    assert_empty errors
    assert_equal segment['tag_name'], saved['tag_name']
    ['', nil].each do |value|
      @tenant.save_segment(id, body.merge('tag_name' => 'Friendly risk'))
      saved, errors = @tenant.save_segment(id, body.merge('tag_name' => value))
      assert_empty errors
      refute saved.key?('tag_name')
    end
  end

  def test_kyc_creation_and_latest_request_controls_profile
    seed
    customer = @tenant.list.first
    original = customer['kyc_status']
    assert_equal original, @tenant.find(customer['id'])['kyc_status']
    older = @tenant.compliance['kyc_requests'].find { |row| row['customer_id'] == customer['id'] }
    status, newer = call('compliance/kyc-requests', 'POST', { 'customer_id' => customer['id'], 'document_name' => 'Proof of address' })
    assert_equal 201, status
    assert_nil newer['preview_url']
    assert_equal 'New', newer['status']
    assert_equal 'PENDING', customer['kyc_status']
    assert_equal 200, call("compliance/kyc-requests/#{older['id']}", 'PATCH', { 'status' => 'Declined' })[0]
    assert_equal 'PENDING', customer['kyc_status']
    assert_equal 200, call("compliance/kyc-requests/#{newer['id']}", 'PATCH', { 'status' => 'Approved' })[0]
    assert_equal 'VERIFIED', customer['kyc_status']
    status, latest = call('compliance/kyc-requests', 'POST', { 'customer_id' => customer['id'], 'document_name' => 'Identity check' })
    assert_equal 201, status
    assert_equal 200, call("compliance/kyc-requests/#{latest['id']}", 'PATCH', { 'status' => 'Declined' })[0]
    assert_equal 'REJECTED', customer['kyc_status']
    assert_equal 404, call('compliance/kyc-requests', 'POST', { 'customer_id' => 'CU-foreign', 'document_name' => 'Other' })[0]
    assert_equal 422, call('compliance/kyc-requests', 'POST', { 'customer_id' => customer['id'], 'document_name' => 'x' * 201 })[0]
  end

  def test_internal_notes_and_foreign_references
    seed
    path = "compliance/customers/#{@tenant.list.first['id']}/chat"
    assert_equal [], call(path)[1]['items']
    status, notes = call(path, 'POST', { 'message' => 'Staff review only' })
    assert_equal 201, status
    note = notes['items'].first
    assert_equal 'Staff review only', note['message']
    assert note['internal']
    assert_equal @a, note['casino_id']
    assert_equal notes, call(path)[1]
    assert_equal 422, call(path, 'POST', { 'message' => ' ' })[0]
    assert_equal 422, call(path, 'POST', { 'message' => 'x' * 4001 })[0]
    assert_equal 422, call(path, 'POST', { 'message' => 'Note', 'recipient' => 'external' })[0]
    assert_equal 404, call('compliance/customers/CU-999/chat')[0]
    assert_equal 404, call('compliance/payouts/foreign', 'PATCH', { 'status' => 'Approved' })[0]
  end

  def test_context_enforces_ownership_and_persists_lazy_seed_and_mutations
    @directory = File.join(__dir__, ".compliance-store-test-#{Process.pid}-#{SecureRandom.hex(4)}")
    Dir.mkdir(@directory, 0700)
    @context.instance_variable_set(:@dir, @directory)
    @context.instance_variable_set(:@path, File.join(@directory, 'casino_context.json'))
    @context.instance_variable_set(:@lock_path, File.join(@directory, 'casino_context.lock'))
    other = @context.empty_state
    ComplianceStore.prepare(other, @b, demo: false)
    document = {
      'casinos' => [@a, @b].map { |id| { 'id' => id, 'created_at' => '2026-01-01', 'name' => id } },
      'tenants' => { @a => @state, @b => other }, 'audit' => [], 'operations' => {}
    }
    @context.persist(document)
    request = lambda do |casino, path, method = 'GET', body = nil|
      req = Request.new(method, { 'X-Casino-Id' => casino, 'Content-Type' => 'application/json' }, body && JSON.generate(body), {})
      res = WEBrick::HTTPResponse.new(WEBrick::Config::HTTP)
      @context.dispatch(req, res, path, false) do
        tenant = Thread.current[:crm_tenant]
        json(res, 200, { items: path == 'segments' ? tenant.segments : tenant.list })
      end
      [res.status, JSON.parse(res.body)]
    end
    assert_empty request.call(@a, 'segments')[1]['items']
    assert_empty request.call(@a, 'customers')[1]['items']
    assert_equal 400, request.call(nil, 'compliance')[0]
    assert_equal 403, request.call('CS-ffffffffffffffff', 'compliance')[0]
    assert_empty JSON.parse(File.read(@context.path))['tenants'][@a]['profiles']
    status, payload = request.call(@a, 'compliance')
    assert_equal 200, status
    assert_equal 24, payload['payouts'].length
    assert_equal 12, request.call(@a, 'customers')[1]['items'].length
    assert_empty request.call(@b, 'customers')[1]['items']
    payout = payload['payouts'].first
    assert_equal 404, request.call(@b, "compliance/payouts/#{payout['id']}", 'PATCH', { status: 'Approved' })[0]
    assert_equal 200, request.call(@a, "compliance/payouts/#{payout['id']}", 'PATCH', { status: 'Pending' })[0]
    persisted = JSON.parse(File.read(@context.path))
    assert_equal 'Pending', persisted['tenants'][@a]['compliance']['payouts'].first['status']
    assert_empty persisted['tenants'][@b]['profiles']
    snapshot = File.read(@context.path)
    assert_equal 'Pending', request.call(@a, 'compliance')[1]['payouts'].first['status']
    assert_equal snapshot, File.read(@context.path)
    assert_nil Thread.current[:crm_tenant]
  end
end

def json(res, status, body)
  res.status = status
  res.body = JSON.generate(body)
end

def read_json(req, res)
  body = JSON.parse(req.body.to_s)
  return body if body.is_a?(Hash)
  json(res, 400, { error: 'JSON object expected' })
  nil
rescue JSON::ParserError
  json(res, 400, { error: 'Invalid JSON' })
  nil
end

def customer_store
  Thread.current[:crm_tenant]
end
