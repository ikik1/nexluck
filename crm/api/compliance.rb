module ComplianceStore
  STATUSES = %w[New Pending Approved Declined].freeze
  COLLECTIONS = %w[payouts kyc_requests alerts].freeze
  PREVIEW_URL = '/coml/demo-document.svg'.freeze
  DEMO_PAYMENT_METHODS = {
    'EUR' => [['Visa', 'Stripe', 'card'], ['SEPA', 'Demo SEPA', 'iban'], ['MasterCard', 'Adyen', 'card']],
    'USD' => [['ACH', 'Demo ACH', 'bank_account'], ['Visa', 'Stripe', 'card'], ['Bank transfer', 'Demo bank', 'bank_account']],
    'GBP' => [['Bank transfer', 'Demo UK bank', 'uk_account'], ['Visa', 'Stripe', 'card']],
    'INR' => [['Paytm', 'Paytm', 'phone'], ['UPI', 'Razorpay', 'upi'], ['Visa', 'Razorpay', 'card']],
    'BRL' => [['Pix', 'EBANX', 'pix'], ['Bank transfer', 'Demo bank', 'bank_account'], ['MasterCard', 'Adyen', 'card']],
    'CAD' => [['Interac', 'Demo Interac', 'email'], ['Bank transfer', 'Demo bank', 'bank_account'], ['Visa', 'Stripe', 'card']],
    'THB' => [['Bank transfer', 'Demo Thai bank', 'bank_account'], ['Visa', 'Demo card gateway', 'card']],
    'NGN' => [['Bank transfer', 'Demo Nigerian bank', 'bank_account'], ['Visa', 'Demo card gateway', 'card']]
  }.freeze
  EXAMPLE_SEGMENTS = [
    ['risk_multiple_ip_login', 'M ip login', 40, 'risk_multiple_ips', true],
    ['fast_bonus_wager', 'bonus wager', 10, 'bonus_wr_rate', 80],
    ['risk_country_login', 'Country login', 50, 'country', %w[AE NG]]
  ].freeze

  def self.prepare(state, casino_id, demo: ENV.fetch('CRM_UI_MODE', 'demo') == 'demo')
    changed = !state.key?('compliance')
    state['compliance'] ||= {
      'version' => 1, 'demo' => false, 'payouts' => [], 'kyc_requests' => [],
      'alerts' => [], 'risk_matrix' => [], 'chat' => {}
    }
    if demo && state['compliance']['seeded']
      changed = add_review_examples(state['compliance']) || changed
      changed = add_payment_examples(state['compliance']) || changed
      changed = add_chat_examples(state['compliance']) || changed
      return add_document_examples(state['compliance']) || changed
    end
    return changed unless demo
    state['compliance'].merge!('demo' => true, 'seeded' => true)
    now = Time.now.utc.iso8601
    identity = Digest::SHA256.hexdigest(casino_id)[0, 12].to_i(16)
    if state['profiles'].empty?
      CUSTOMER_OBJECTS.each_with_index do |template, index|
        profile = JSON.parse(JSON.generate(template))
        profile.merge!('id' => "CU-#{identity * 100 + index}", 'casino_id' => casino_id,
          'external_id' => "DEMO-COMPLIANCE-#{identity}-#{index + 1}",
          'name' => "demo.compliance.#{index + 1}", 'demo' => true,
          'info' => 'Synthetic compliance demo profile. No credentials or financial ledger.',
          'created_at' => now, 'updated_at' => now)
        %w[country currency lang].zip(%w[countries currencies languages]).each do |field, catalog|
          records = state['catalogs'][catalog]
          profile[field] = records.first['code'] unless records.empty?
          unless records.any? { |record| record['code'] == profile[field] }
            records << { 'id' => "#{catalog}-#{profile[field]}", 'code' => profile[field], 'casino_id' => casino_id }
          end
        end
        state['profiles'][profile['id']] = profile
      end
    end
    EXAMPLE_SEGMENTS.each_with_index do |(name, tag, score, field, value), index|
      segment = state['segments'].values.find { |item| item['name'] == name }
      unless segment
        if field == 'country'
          countries = state['catalogs']['countries'].map { |record| record['code'] }
          value &= countries
          value = countries.first(2) if value.empty?
        end
        next if value == []
        id = "SG-#{identity * 100 + index}"
        segment = {
          'id' => id, 'casino_id' => casino_id, 'name' => name, 'tag_name' => tag,
          'created_at' => now, 'updated_at' => now,
          'rules' => { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [
            { 'kind' => 'rule', 'field' => field, 'operator' => field == 'bonus_wr_rate' ? '>=' : 'IS',
              'value' => value, 'not' => false }
          ] }
        }
        state['segments'][id] = segment
      end
      unless state['compliance']['risk_matrix'].any? { |entry| entry['segment_id'] == segment['id'] }
        state['compliance']['risk_matrix'] << { 'segment_id' => segment['id'], 'score' => score }
      end
    end
    customers = state['profiles'].values.sort_by { |profile| profile['id'] }
    { 'payouts' => 15, 'kyc_requests' => 20, 'alerts' => 30 }.each do |collection, count|
      count.times do |index|
        customer = customers[index % customers.length]
        row = {
          'id' => "DEMO-#{collection.upcase}-#{identity}-#{index + 1}",
          'external_id' => "DEMO-#{collection.upcase}-#{index + 1}",
          'customer_id' => customer['id'], 'casino_id' => casino_id,
          'created_at' => now, 'updated_at' => now, 'status' => 'New', 'demo' => true,
          'source' => 'synthetic_demo', 'audit' => []
        }
        case collection
        when 'payouts'
          row.merge!('amount' => (index + 1) * 25, 'currency' => customer['currency'], 'payment_method' => 'Demo bank transfer')
        when 'kyc_requests'
          row.merge!('document_name' => "Demo identity document #{index + 1}", 'preview_url' => PREVIEW_URL)
        when 'alerts'
          row['last_session'] = { 'ip' => "192.0.2.#{index + 1}", 'country' => customer['country'],
            'at' => now, 'device' => index.even? ? 'Desktop' : 'Mobile' }
        end
        state['compliance'][collection] << row
      end
    end
    add_review_examples(state['compliance'])
    add_payment_examples(state['compliance'])
    add_chat_examples(state['compliance'])
    add_document_examples(state['compliance'])
    true
  end

  def self.add_document_examples(compliance)
    changed = false
    compliance['kyc_requests'].each do |row|
      next unless row['source'] == 'synthetic_demo' && row['preview_url'] == PREVIEW_URL && !row.key?('documents')
      uploaded_at = Time.iso8601(row['created_at'])
      row['documents'] = 3.times.map do |index|
        { 'id' => "#{row['id']}-DOCUMENT-#{index + 1}",
          'name' => "#{row['document_name']} - version #{index + 1}",
          'url' => PREVIEW_URL, 'uploaded_at' => (uploaded_at - (2 - index) * 86_400).iso8601,
          'demo' => true }
      end
      changed = true
    end
    changed
  end

  def self.add_chat_examples(compliance)
    return false if compliance['chat_examples_seeded']
    compliance['kyc_requests'].select { |row| row['source'] == 'synthetic_demo' }.group_by { |row| row['customer_id'] }.each do |customer_id, requests|
      request = requests.first
      items = compliance['chat'][customer_id] ||= []
      next unless items.empty?
      now = Time.now.utc
      12.times do |index|
        item = { 'id' => "#{request['id']}-CHAT-#{index + 1}", 'customer_id' => customer_id,
          'casino_id' => request['casino_id'], 'request_id' => request['id'], 'sender' => 'player',
          'internal' => false, 'demo' => true, 'created_at' => (now - (12 - index) * 60).iso8601,
          'message' => index < 2 ? "Demo: previous document conversation #{index + 1}." : "Demo: please review my document update #{index - 1}." }
        item['read_at'] = (now - 600).iso8601 if index < 2
        items << item
      end
    end
    compliance['chat_examples_seeded'] = true
    true
  end

  def self.add_payment_examples(compliance)
    counts = Hash.new(0)
    changed = false
    compliance['payouts'].each_with_index do |row, index|
      next unless row['source'] == 'synthetic_demo' && row['payment_method'] == 'Demo bank transfer' &&
        !row['masked_destination'] && !row['connection_id']
      currency = row['currency']
      methods = DEMO_PAYMENT_METHODS.fetch(currency, [['Visa', 'Demo card gateway', 'card'], ['MasterCard', 'Demo card gateway', 'card']])
      method, brand, type = methods[counts[currency] % methods.length]
      counts[currency] += 1
      last = format('%04d', 1200 + index)
      destination = case type
                    when 'card' then "#{method == 'MasterCard' ? '5102' : '4102'} xxxxxx #{last}"
                    when 'iban' then "DE** **** **** **** **#{last}"
                    when 'uk_account' then "Sort code **-**-** / Account **** #{last}"
                    when 'phone' then "+91 ******#{last}"
                    when 'upi' then "demo***#{last}@paytm"
                    when 'pix' then "demo***#{last}@example.invalid"
                    when 'email' then "demo***#{last}@example.invalid"
                    else "**** #{last}"
                    end
      row.merge!('payment_method' => method, 'payment_brand' => brand, 'destination_type' => type,
        'masked_destination' => destination)
      changed = true
    end
    changed
  end

  def self.add_review_examples(compliance)
    return false if compliance['review_examples_seeded']
    %w[payouts kyc_requests].each do |collection|
      template = compliance[collection].find { |row| row['source'] == 'synthetic_demo' }
      next unless template
      %w[Pending Declined Approved].each do |status|
        3.times do |index|
          id = "#{template['id']}-#{status.upcase}-#{index + 1}"
          next if compliance[collection].any? { |row| row['id'] == id }
          row = JSON.parse(JSON.generate(template))
          row.merge!('id' => id, 'external_id' => "#{template['external_id']}-#{status.upcase}-#{index + 1}",
            'status' => status, 'audit' => [], 'created_at' => Time.now.utc.iso8601, 'updated_at' => Time.now.utc.iso8601)
          compliance[collection] << row
        end
      end
    end
    compliance['review_examples_seeded'] = true
    true
  end

  def compliance
    @state.fetch('compliance')
  end

  def kyc_approvable?(customer_id)
    requests = compliance['kyc_requests'].select { |row| row['customer_id'] == customer_id }
    !requests.empty? && requests.all? { |row| row['status'] == 'Approved' }
  end

  def update(id, body)
    if body['kyc_status'] == 'VERIFIED' && find(id)['kyc_status'] != 'VERIFIED' && !kyc_approvable?(id)
      return [nil, { 'kyc_status' => 'All KYC requests must be approved first' }]
    end
    super
  end

  def segments
    scores = @state.dig('compliance', 'risk_matrix').to_a.to_h { |entry| [entry['segment_id'], entry['score']] }
    super.map { |segment| segment.merge('risk_score' => scores.fetch(segment['id'], 0)) }
  end

  def segment(id)
    record = super
    record && record.merge('risk_score' => @state.dig('compliance', 'risk_matrix').to_a.find { |entry| entry['segment_id'] == id }&.fetch('score') || 0)
  end

  def compliance_error(res, field, message, status = 422)
    json(res, status, { error: 'Validation failed', fields: { field => message } })
  end

  def compliance_fields(body, allowed, res)
    unknown = body.keys - allowed
    return true if unknown.empty?
    compliance_error(res, unknown.first, 'Unknown or read-only field')
    false
  end

  def handle_compliance(req, res, rest)
    method = req.request_method
    return json(res, 413, { error: 'Compliance request exceeds 64 KiB' }) if req.body.to_s.bytesize > 65_536
    if rest == 'compliance'
      return json(res, 405, { error: 'GET required' }) unless method == 'GET'
      payload = compliance.slice(*COLLECTIONS, 'risk_matrix', 'demo')
      payload['kyc_requests'] = compliance['kyc_requests'].map do |row|
        row.merge('unread_messages' => compliance['chat'].fetch(row['customer_id'], []).count { |item| item['sender'] == 'player' && !item['read_at'] && item['request_id'] == row['id'] },
          'kyc_approvable' => kyc_approvable?(row['customer_id']),
          'documents' => row.fetch('documents', row['preview_url'] ? [{ 'id' => row['id'] + '-original', 'name' => row['document_name'], 'url' => row['preview_url'], 'uploaded_at' => row['created_at'] }] : []))
      end
      return json(res, 200, payload)
    end
    if (match = rest.match(%r{\Acompliance/customers/(CU-\d+)/approve-kyc\z}))
      return json(res, 405, { error: 'POST required' }) unless method == 'POST'
      customer = find(match[1])
      return json(res, 404, { error: 'Customer not found' }) unless customer
      body = read_json(req, res)
      return unless body && compliance_fields(body, [], res)
      return compliance_error(res, 'kyc_status', 'All KYC requests must be approved first', 409) unless kyc_approvable?(customer['id'])
      customer.merge!('kyc_status' => 'VERIFIED', 'kyc_approved_at' => Time.now.utc.iso8601, 'kyc_approved_by' => compliance_actor(req), 'updated_at' => Time.now.utc.iso8601)
      return json(res, 200, customer)
    end
    if (match = rest.match(%r{\Acompliance/customers/(CU-\d+)/chat/read\z}))
      return json(res, 405, { error: 'POST required' }) unless method == 'POST'
      return json(res, 404, { error: 'Customer not found' }) unless find(match[1])
      body = read_json(req, res)
      return unless body && compliance_fields(body, ['ids'], res)
      ids = body['ids']
      return compliance_error(res, 'ids', 'Supply message IDs') unless ids.is_a?(Array) && ids.length <= 1000 && ids.all? { |id| id.is_a?(String) }
      compliance['chat'].fetch(match[1], []).each do |item|
        item['read_at'] ||= Time.now.utc.iso8601 if item['sender'] == 'player' && ids.include?(item['id'])
      end
      return json(res, 200, { read: true })
    end
    if rest == 'compliance/risk-matrix'
      return json(res, 405, { error: 'Method not allowed' }) unless %w[GET PATCH].include?(method)
      if method == 'PATCH'
        body = read_json(req, res)
        return unless body && compliance_fields(body, ['entries'], res)
        entries = body['entries']
        valid = entries.is_a?(Array) && entries.length <= 1000 && entries.all? do |entry|
          entry.is_a?(Hash) && entry.keys.sort == %w[score segment_id] &&
            entry['segment_id'].is_a?(String) && @segments.key?(entry['segment_id']) &&
            entry['score'].is_a?(Integer) && entry['score'].between?(0, 100)
        end
        return compliance_error(res, 'entries', 'Supply unique casino-local segment IDs and integer scores from 0 to 100') unless valid && entries.map { |entry| entry['segment_id'] }.uniq.length == entries.length
        compliance['risk_matrix'] = entries
        compliance['risk_matrix_updated_at'] = Time.now.utc.iso8601
        compliance['risk_matrix_updated_by'] = compliance_actor(req)
      end
      return json(res, 200, { entries: compliance['risk_matrix'] })
    end
    if (match = rest.match(%r{\Acompliance/customers/(CU-\d+)/chat\z}))
      return json(res, 405, { error: 'Method not allowed' }) unless %w[GET POST].include?(method)
      customer_id = match[1]
      return json(res, 404, { error: 'Customer not found' }) unless find(customer_id)
      items = compliance['chat'].fetch(customer_id, [])
      if method == 'POST'
        body = read_json(req, res)
        return unless body && compliance_fields(body, ['message'], res)
        message = body['message']
        return compliance_error(res, 'message', 'Supply an internal note of 1 to 4000 characters') unless message.is_a?(String) && message.strip.length.between?(1, 4000) && !message.include?("\u0000")
        return compliance_error(res, 'message', 'Internal note limit reached', 409) if items.length >= 1000
        items << { 'id' => owned_ids('NOTE'), 'message' => message.strip, 'created_at' => Time.now.utc.iso8601,
          'casino_id' => @casino_id, 'customer_id' => customer_id, 'created_by' => compliance_actor(req), 'internal' => true, 'sender' => 'staff' }
        compliance['chat'][customer_id] = items
      end
      return json(res, method == 'POST' ? 201 : 200, { items: items })
    end
    if (match = rest.match(%r{\Acompliance/customers/(CU-\d+)/block\z}))
      return json(res, 405, { error: 'POST required' }) unless method == 'POST'
      customer = find(match[1])
      return json(res, 404, { error: 'Customer not found' }) unless customer
      body = read_json(req, res)
      return unless body && compliance_fields(body, [], res)
      unless customer['compliance_blocked']
        now = Time.now.utc.iso8601
        customer.merge!('compliance_blocked' => true, 'compliance_blocked_at' => now,
          'compliance_blocked_by' => compliance_actor(req), 'updated_at' => now)
      end
      return json(res, 200, customer)
    end
    if rest == 'compliance/kyc-requests'
      return json(res, 405, { error: 'POST required' }) unless method == 'POST'
      body = read_json(req, res)
      return unless body && compliance_fields(body, %w[customer_id document_name], res)
      customer = body['customer_id'].is_a?(String) && find(body['customer_id'])
      return json(res, 404, { error: 'Customer not found' }) unless customer
      name = body['document_name']
      return compliance_error(res, 'document_name', 'Supply a document name of 1 to 200 characters') unless name.is_a?(String) && name.strip.length.between?(1, 200) && !name.match?(/[\x00-\x1f]/)
      now = Time.now.utc.iso8601
      row = { 'id' => owned_ids('KYC'), 'external_id' => "KYC-#{SecureRandom.hex(8)}",
        'customer_id' => customer['id'], 'casino_id' => @casino_id, 'created_at' => now, 'updated_at' => now,
        'status' => 'New', 'document_name' => name.strip, 'preview_url' => nil,
        'demo' => compliance['demo'], 'created_by' => compliance_actor(req), 'audit' => [] }
      compliance['kyc_requests'] << row
      customer.merge!('kyc_status' => 'PENDING', 'updated_at' => now)
      return json(res, 201, row)
    end
    if (match = rest.match(%r{\Acompliance/(payouts|kyc-requests|alerts)/([\w-]+)\z}))
      return json(res, 405, { error: 'PATCH required' }) unless method == 'PATCH'
      collection, id = match.captures
      row = compliance.fetch(collection.tr('-', '_')).find { |record| record['id'] == id }
      return json(res, 404, { error: 'Compliance record not found' }) unless row
      return json(res, 404, { error: 'Customer not found' }) unless find(row['customer_id'])
      body = read_json(req, res)
      return unless body && compliance_fields(body, collection == 'payouts' ? %w[status action] : ['status'], res)
      if collection == 'payouts'
        return compliance_error(res, 'action', 'Use approve or decline; payouts cannot be completed manually') unless body.keys == ['action'] && %w[approve decline].include?(body['action'])
        return compliance_error(res, 'action', 'Only new payouts can be approved', 409) if body['action'] == 'approve' && row['status'] != 'New'
      end
      status = collection == 'payouts' ? (body['action'] == 'approve' ? 'Pending' : 'Declined') : body['status']
      return compliance_error(res, 'status', 'Choose New, Pending, Approved or Declined') unless STATUSES.include?(status)
      if status != row['status']
        allowed = { 'New' => %w[Pending Approved Declined], 'Pending' => %w[Approved Declined] }
        return compliance_error(res, 'status', 'Status transition is not allowed', 409) unless allowed.fetch(row['status'], []).include?(status)
        now = Time.now.utc.iso8601
        row['audit'] << { 'at' => now, 'by' => compliance_actor(req), 'from' => row['status'], 'to' => status }
        row.merge!('status' => status, 'updated_at' => now, 'updated_by' => compliance_actor(req))
        if collection == 'kyc-requests'
          find(row['customer_id']).merge!('kyc_status' => compliance['kyc_requests'].any? { |record| record['customer_id'] == row['customer_id'] && record['status'] == 'Declined' } ? 'REJECTED' : 'PENDING',
            'updated_at' => now)
        end
      end
      return json(res, 200, row)
    end
    json(res, 404, { error: 'Not found' })
  end

  def compliance_actor(req)
    req.attributes['client'] || req.attributes['operator'] || 'demo-staff'
  end
end
