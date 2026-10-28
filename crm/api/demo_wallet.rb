module DemoWallet
  def handle_demo_wallet(req, res, rest)
    return json(res, 404, { error: 'Demo wallet is unavailable outside demo mode' }) unless ENV.fetch('CRM_UI_MODE', 'demo') == 'demo'
    return json(res, 413, { error: 'Demo wallet request exceeds 64 KiB' }) if req.body.to_s.bytesize > 65_536
    query = URI.decode_www_form(req.query_string.to_s).to_h
    customer = query['customer'].to_s.empty? ? list.first : find(query['customer'])
    return json(res, 404, { error: 'Demo customer not found' }) unless customer
    method = req.request_method
    connections = @state['finance']['connections'].select do |connection|
      connection['casino_id'] == @casino_id && connection.fetch('payout', true) &&
        connection['enabled'] != false && connection['conn'] != 'offline'
    end
    if rest == 'compliance/demo-wallet' && method == 'GET'
      return json(res, 200, {
        demo: true, customer: customer.slice('id', 'name', 'kyc_status'),
        customers: list.map { |profile| profile.slice('id', 'name') },
        connections: connections.map { |connection| connection.slice('id', 'name', 'brand', 'currency', 'methods') },
        requests: compliance['kyc_requests'].select { |row| row['customer_id'] == customer['id'] },
        messages: compliance['chat'].fetch(customer['id'], []).reject { |item| item['internal'] }
      })
    end
    return json(res, 405, { error: 'POST required' }) unless method == 'POST'
    expected = "#{req['X-Forwarded-Proto'] || req.request_uri.scheme}://#{req['Host']}"
    return json(res, 403, { error: 'Cross-site demo writes are forbidden' }) if req['Sec-Fetch-Site'] == 'cross-site' || (req['Origin'] && req['Origin'] != expected)
    body = read_json(req, res)
    return unless body
    now = Time.now.utc.iso8601
    if rest == 'compliance/demo-wallet/payouts'
      return unless compliance_fields(body, %w[connection_id method destination amount currency request_key], res)
      key = body['request_key']
      return compliance_error(res, 'request_key', 'Supply a unique request key') unless key.is_a?(String) && key.match?(/\A[\w-]{16,80}\z/)
      previous = compliance['payouts'].find { |row| row['customer_id'] == customer['id'] && row['request_key'] == key }
      if previous
        same = %w[connection_id method destination amount currency].all? do |field|
          stored = { 'method' => 'payment_method', 'destination' => 'masked_destination' }.fetch(field, field)
          previous[stored] == body[field]
        end
        return compliance_error(res, 'request_key', 'Request key was already used with different details', 409) unless same
        return json(res, 200, previous)
      end
      connection = connections.find { |row| row['id'].to_s == body['connection_id'].to_s }
      return compliance_error(res, 'connection_id', 'Choose an enabled payout connection') unless connection
      return compliance_error(res, 'method', 'Choose a supported method') unless connection['methods'].include?(body['method'])
      return compliance_error(res, 'currency', 'Currency must match the connection') unless body['currency'] == connection['currency']
      amount = body['amount']
      return compliance_error(res, 'amount', 'Supply a finite amount of at least 10 with at most two decimals') unless amount.is_a?(Numeric) && amount.finite? && amount >= 10 && amount <= 1_000_000 && (amount * 100 - (amount * 100).round).abs < 0.00001
      destination = body['destination']
      return compliance_error(res, 'destination', 'Supply masked destination details only') unless destination.is_a?(String) && destination.match?(/\A[\w .:*()\-]{4,100}\z/) && destination.match?(/[*x]/i) && !destination.match?(/\d{5,}/)
      if %w[Visa MasterCard].include?(body['method'])
        return compliance_error(res, 'destination', 'Use first four and last four card digits only') unless destination.match?(/\A\d{4} x{6} \d{4}\z/)
      end
      id = owned_ids('PAYOUT')
      row = { 'id' => id, 'external_id' => id, 'customer_id' => customer['id'], 'casino_id' => @casino_id,
        'created_at' => now, 'updated_at' => now, 'status' => 'New', 'demo' => true, 'source' => 'demo_wallet',
        'amount' => amount, 'currency' => body['currency'], 'connection_id' => connection['id'],
        'connection_name' => connection['name'], 'payment_brand' => connection['brand'],
        'payment_method' => body['method'], 'masked_destination' => destination, 'audit' => [], 'request_key' => key }
      row['destination_type'] = if %w[Visa MasterCard].include?(body['method'])
                                  'card'
                                else
                                  { 'SEPA' => 'iban', 'Bank transfer' => 'bank_account', 'ACH' => 'bank_account',
                                    'Paytm' => 'phone', 'UPI' => 'upi', 'Pix' => 'pix', 'Interac' => 'email' }.fetch(body['method'], 'other')
                                end
      compliance['payouts'] << row
      return json(res, 201, row)
    end
    if rest == 'compliance/demo-wallet/chat'
      return unless compliance_fields(body, %w[message request_id], res)
      request = compliance['kyc_requests'].find do |row|
        row['customer_id'] == customer['id'] && (!body['request_id'] || row['id'] == body['request_id'])
      end
      return json(res, 404, { error: 'KYC request not found' }) unless request
      message = body['message']
      return compliance_error(res, 'message', 'Supply a message of 1 to 4000 characters') unless message.is_a?(String) && message.strip.length.between?(1, 4000) && !message.include?("\u0000")
      items = compliance['chat'][customer['id']] ||= []
      return compliance_error(res, 'message', 'Message limit reached', 409) if items.length >= 1000
      item = { 'id' => owned_ids('CHAT'), 'customer_id' => customer['id'], 'casino_id' => @casino_id,
        'message' => message.strip, 'created_at' => now, 'sender' => 'player', 'internal' => false, 'request_id' => request['id'] }
      items << item
      return json(res, 201, item)
    end
    if rest == 'compliance/demo-wallet/documents'
      return unless compliance_fields(body, %w[request_id name], res)
      row = compliance['kyc_requests'].find { |request| request['id'] == body['request_id'] && request['customer_id'] == customer['id'] }
      return json(res, 404, { error: 'KYC request not found' }) unless row
      name = body['name']
      return compliance_error(res, 'name', 'Supply a demo document name of 1 to 200 characters') unless name.is_a?(String) && name.strip.length.between?(1, 200) && !name.match?(/[\x00-\x1f]/)
      documents = row['documents'] ||= row['preview_url'] ? [{ 'id' => row['id'] + '-original', 'name' => row['document_name'], 'url' => ComplianceStore::PREVIEW_URL, 'uploaded_at' => row['created_at'] }] : []
      return compliance_error(res, 'name', 'Document history limit reached', 409) if documents.length >= 100
      documents << { 'id' => owned_ids('DOC'), 'name' => name.strip, 'url' => ComplianceStore::PREVIEW_URL, 'uploaded_at' => now, 'demo' => true }
      row['audit'] << { 'at' => now, 'by' => 'demo-player', 'from' => row['status'], 'to' => 'New', 'reason' => 'document_submitted' }
      row.merge!('preview_url' => ComplianceStore::PREVIEW_URL, 'updated_at' => now, 'status' => 'New')
      customer.merge!('kyc_status' => 'PENDING', 'updated_at' => now)
      return json(res, 201, row)
    end
    json(res, 404, { error: 'Not found' })
  end
end
