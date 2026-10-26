require 'minitest/autorun'
require 'tmpdir'
require 'json'
require 'date'
require 'time'
require 'openssl'
require 'base64'
require 'securerandom'

ROOT = File.expand_path('../../..', __dir__)
require_relative '../customers'

class CustomerStoreTest < Minitest::Test
  def setup
    @old_dir = ENV['CRM_CUSTOMER_DATA_DIR']
    @dir = Dir.mktmpdir('nexluck-customers-test-')
    ENV['CRM_CUSTOMER_DATA_DIR'] = @dir
    @store = CustomerStore.new
  end

  def teardown
    ENV['CRM_CUSTOMER_DATA_DIR'] = @old_dir
    FileUtils.remove_entry(@dir)
  end

  def test_seed_and_separate_entity_permissions
    assert_equal 12, @store.list.length
    assert_equal CUSTOMER_OBJECTS, @store.list
    assert_equal 'luna.play', @store.find('CU-1001')['name']
    assert_equal 0700, File.stat(@dir).mode & 0777
    %w[profiles.json credentials.json segments.json].each { |name| assert_equal 0600, File.stat(File.join(@dir, name)).mode & 0777 }
    assert_equal({}, JSON.parse(File.read(File.join(@dir, 'credentials.json'))))
    refute @store.list.any? { |c| c.keys.any? { |k| k.include?('password') } }
  end

  def test_edits_persist_and_timestamps_are_server_owned
    saved, errors = @store.update('CU-1001', { 'name' => 'Edited customer', 'info' => 'Saved notes', 'risk_score' => 100 })
    assert_empty errors
    assert_equal 'Edited customer', saved['name']
    assert_equal '2026-08-01T10:00:00Z', saved['created_at']
    assert_equal saved, CustomerStore.new.find('CU-1001')
    assert_equal 'luna.play', CUSTOMER_OBJECTS.first['name']
    assert_operator Time.iso8601(saved['updated_at']), :>=, Time.now - 5
  end

  def test_funnel_status_validation_and_persistence
    CUSTOMER_FUNNEL_STATUSES.each do |status|
      saved, errors = @store.update('CU-1001', { 'funnel_status' => status })
      assert_empty errors
      assert_equal status, saved['funnel_status']
      assert_equal status, CustomerStore.new.find('CU-1001')['funnel_status']
    end
    before = @store.find('CU-1001').dup
    [nil, 'Fake', 'VIP '].each do |status|
      saved, errors = @store.update('CU-1001', { 'funnel_status' => status })
      assert_nil saved
      assert errors.key?('funnel_status')
      assert_equal before, @store.find('CU-1001')
    end
  end

  def test_existing_profiles_receive_new_metadata_without_losing_edits
    saved, = @store.update('CU-1001', { 'name' => 'Saved customer' })
    profiles = JSON.parse(File.read(File.join(@dir, 'profiles.json')))
    profiles.each_value { |profile| %w[funnel_status activity risk_indicators gender devices sessions_per_week bonus_wr_rate].each { |key| profile.delete(key) } }
    File.write(File.join(@dir, 'profiles.json'), JSON.generate(profiles))
    restored = CustomerStore.new.find('CU-1001')
    assert_equal 'Saved customer', restored['name']
    assert_equal saved['updated_at'], restored['updated_at']
    assert_equal CUSTOMER_OBJECTS.first['funnel_status'], restored['funnel_status']
    assert_equal CUSTOMER_OBJECTS.first['activity'], restored['activity']
    assert_equal CUSTOMER_OBJECTS.first['risk_indicators'], restored['risk_indicators']
    assert_equal CUSTOMER_OBJECTS.first['gender'], restored['gender']
    assert_equal CUSTOMER_OBJECTS.first['devices'], restored['devices']
  end

  def test_validation_is_atomic
    before = @store.find('CU-1001').dup
    [
      { 'risk_score' => -1 }, { 'risk_score' => 101 }, { 'risk_score' => 2.5 },
      { 'birthday' => '2026-02-30' }, { 'birthday' => (Date.today + 1).iso8601 },
      { 'name' => '' }, { 'external_id' => 'PLAYER-5002' }, { 'info' => 'x' * 4001 },
      { 'mfa_type' => 'FAKE' }, { 'country' => nil }, { 'currency' => 'FAKE' },
      { 'id' => 'CU-9999' }, { 'created_at' => 'now' }, { 'updated_at' => 'now' },
      { 'password' => SecureRandom.hex(16) }, { 'activity' => {} }, { 'risk_indicators' => [] },
      { 'gender' => 'Invalid' }, { 'devices' => ['Mobile'] }, { 'sessions_per_week' => 5 }, { 'bonus_wr_rate' => 100 }
    ].each do |body|
      saved, errors = @store.update('CU-1001', body)
      assert_nil saved
      refute_empty errors
      assert_equal before, @store.find('CU-1001')
    end
  end

  def test_password_is_salted_sha512_derivation_and_not_profile_data
    password = SecureRandom.hex(16)
    @store.set_password('CU-1001', password)
    record = JSON.parse(File.read(File.join(@dir, 'credentials.json')))['CU-1001']
    assert_equal 'PBKDF2-HMAC-SHA512', record['algorithm']
    salt = Base64.strict_decode64(record['salt'])
    assert_equal 32, salt.bytesize
    digest = OpenSSL::PKCS5.pbkdf2_hmac(password, salt, record['iterations'], 64, 'sha512')
    assert_equal digest, Base64.strict_decode64(record['password_hash'])
    refute_includes File.read(File.join(@dir, 'profiles.json')), password
    refute_includes File.read(File.join(@dir, 'credentials.json')), password
    @store.set_password('CU-1001', password)
    second = JSON.parse(File.read(File.join(@dir, 'credentials.json')))['CU-1001']
    refute_equal record['salt'], second['salt']
    refute_equal record['password_hash'], second['password_hash']
  end

  def test_refuses_storage_under_document_root
    ENV['CRM_CUSTOMER_DATA_DIR'] = File.join(ROOT, 'crm')
    assert_raises(RuntimeError) { CustomerStore.new }
  end

  def test_segment_parameter_catalog_and_allowed_operators
    assert_equal 37, CustomerSegments::PARAMETERS.length
    assert_equal 37, CustomerSegments::BY_KEY.length
    CustomerSegments::PARAMETERS.each do |parameter|
      value = case parameter['type']
              when 'list' then [parameter['options'].first]
              when 'boolean' then true
              when 'number' then 500
              when 'date' then '2026-08-01'
              end
      CustomerSegments::OPERATORS[parameter['type']].each do |operator|
        rule = { 'kind' => 'rule', 'field' => parameter['key'], 'operator' => operator, 'value' => value, 'not' => false }
        rule['currency'] = 'EUR' if parameter['money']
        rule['days'] = 30 if parameter['key'] == 'net_cash_flow'
        clean, errors = CustomerSegments.validate({ 'name' => 'test', 'rules' => rule })
        assert_empty errors, "#{parameter['key']} #{operator}"
        assert_equal operator == '<=' ? '=<' : operator, clean['rules']['operator']
      end
    end
  end

  def test_segments_persist_and_duplicate_names_and_invalid_rules_are_atomic
    body = JSON.parse(JSON.generate(CustomerSegments::SEEDS.last)).slice('name', 'rules')
    body['name'] = 'My saved segment'
    saved, errors = @store.save_segment(nil, body)
    assert_empty errors
    assert_equal 'SG-1005', saved['id']
    assert_equal saved, CustomerStore.new.segment(saved['id'])
    edited, errors = @store.save_segment(saved['id'], body.merge('name' => 'Edited segment'))
    assert_empty errors
    assert_equal saved['created_at'], edited['created_at']
    assert_equal edited, CustomerStore.new.segment(saved['id'])
    duplicate, errors = @store.save_segment(nil, body.merge('name' => 'edited SEGMENT'))
    assert_nil duplicate
    assert errors.key?('name')
    before = JSON.generate(@store.segments)
    invalid_rules = [
      nil, { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [] },
      { 'kind' => 'group', 'operator' => 'XOR', 'not' => false, 'children' => [body['rules']['children'].first] },
      { 'kind' => 'rule', 'field' => 'unknown', 'operator' => 'IS', 'value' => true, 'not' => false }
    ]
    base = body['rules']['children']
    invalid_rules += [
      base[0].merge('value' => []), base[0].merge('value' => %w[DE DE]),
      base[0].merge('value' => ['FAKE']), base[0].merge('operator' => '>'),
      base[0].merge('not' => 'false'), base[0].merge('untrusted' => 'x'),
      base[1].merge('value' => '500'), base[1].merge('currency' => 'FAKE'),
      base[1].reject { |key, _| key == 'currency' },
      base[2].merge('value' => 'true'),
      { 'kind' => 'rule', 'field' => 'registration_date', 'operator' => '=', 'value' => '2026-02-30', 'not' => false },
      { 'kind' => 'rule', 'field' => 'net_cash_flow', 'operator' => '>', 'value' => 0, 'currency' => 'EUR', 'days' => 0, 'not' => false }
    ]
    invalid_rules.each do |rules|
      saved, errors = @store.save_segment(edited['id'], { 'name' => 'Should not save', 'rules' => rules })
      assert_nil saved
      refute_empty errors
      assert_equal before, JSON.generate(@store.segments)
    end
  end

  def test_segment_tag_name_is_optional_preserved_and_clearable
    body = JSON.parse(JSON.generate(CustomerSegments::SEEDS.first)).slice('name', 'rules')
    legacy = @store.segment('SG-1001')
    refute legacy.key?('tag_name')
    edited, errors = @store.save_segment('SG-1001', body)
    assert_empty errors
    refute edited.key?('tag_name')
    tagged, errors = @store.save_segment('SG-1001', body.merge('tag_name' => '  Registered players  '))
    assert_empty errors
    assert_equal 'Registered players', tagged['tag_name']
    assert_equal 'REGISTERED', tagged['name']
    kept, errors = @store.save_segment('SG-1001', body)
    assert_empty errors
    assert_equal 'Registered players', kept['tag_name']
    assert_equal kept, CustomerStore.new.segment('SG-1001')
    [nil, '', '   '].each do |blank|
      cleared, errors = @store.save_segment('SG-1001', body.merge('tag_name' => blank))
      assert_empty errors
      refute cleared.key?('tag_name')
    end
    [42, 'x' * 201, "bad\u0000"].each do |invalid|
      saved, errors = @store.save_segment('SG-1001', body.merge('tag_name' => invalid))
      assert_nil saved
      assert errors.key?('tag_name')
    end
    saved, errors = @store.save_segment('SG-1001', body.merge('risk_score' => 40))
    assert_nil saved
    assert errors.key?('risk_score')
  end

  def test_segment_depth_and_size_limits
    rule = CustomerSegments::SEEDS.first['rules']['children'].first
    group = ->(children) { { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => children } }
    root = group.call(Array.new(99) { rule })
    assert_empty CustomerSegments.validate({ 'name' => 'max', 'rules' => root })[1]
    root['children'] << rule
    refute_empty CustomerSegments.validate({ 'name' => 'oversized', 'rules' => root })[1]
    root = rule
    5.times { root = group.call([root]) }
    assert_empty CustomerSegments.validate({ 'name' => 'depth', 'rules' => root })[1]
    refute_empty CustomerSegments.validate({ 'name' => 'deep', 'rules' => group.call([root]) })[1]
  end

  def test_gender_is_editable_and_saved
    saved, errors = @store.update('CU-1001', { 'gender' => 'Undisclosed' })
    assert_empty errors
    assert_equal 'Undisclosed', CustomerStore.new.find('CU-1001')['gender']
    assert_equal 'Undisclosed', saved['gender']
  end
end
