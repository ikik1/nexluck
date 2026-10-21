module CustomerSegments
  def self.parameter(key, label, group, type, options = nil, money = false, hint = nil)
    { 'key' => key, 'label' => label, 'group' => group, 'type' => type,
      'options' => options, 'money' => money, 'hint' => hint }
  end

  PARAMETERS = [
    parameter('country', 'Country', 'Profile', 'list', CustomerStore::COUNTRIES),
    parameter('geo_zone', 'Geo zone', 'Profile', 'list', ['SEA', 'APAC', 'MENA', 'LATM', 'CIS', 'Europe', 'Africa', 'Canada', 'United States']),
    parameter('currency', 'Currency', 'Profile', 'list', CustomerStore::CURRENCIES),
    parameter('lang', 'Language', 'Profile', 'list', CustomerStore::LANGUAGES),
    parameter('age', 'Age (date of birth)', 'Profile', 'number', nil, false, 'Completed years calculated from birthday.'),
    parameter('gender', 'Gender', 'Profile', 'list', %w[Female Male Non-binary Undisclosed]),
    parameter('funnel_status', 'Funnel status', 'Account', 'list', CUSTOMER_FUNNEL_STATUSES),
    parameter('legacy_group', 'Imported demo targeting tag', 'Account', 'list',
      %w[REGISTERED VIP KYC_VERIFIED FIRST_DEP HIGH_ROLLER MOBILE NO_DEPOSIT registered no_deposit kyc_verified restricted_countries restricted_currencies],
      false, 'Preserved imported demo tags, not inferred thresholds or live segment membership.'),
    parameter('registration_date', 'Registration date', 'Account', 'date'),
    parameter('account_age', 'Account age (days)', 'Account', 'number'),
    parameter('kyc_status', 'KYC status', 'Account', 'list', CustomerStore::OPTIONS['kyc_status']),
    parameter('days_since_login', 'Days since last login', 'Activity', 'number'),
    parameter('hours_in_game', 'Hours in game', 'Activity', 'number', nil, false, 'Demo total game hours.'),
    parameter('session_time', 'Session time (hours)', 'Activity', 'number', nil, false, 'Demo last-session duration.'),
    parameter('sessions_per_week', 'Sessions per week', 'Activity', 'number', nil, false, 'Demo value; live calculation is not connected.'),
    parameter('devices', 'Devices', 'Activity', 'list', %w[Desktop Mobile Tablet]),
    parameter('lifetime_ggr', 'Lifetime GGR', 'Finance', 'number', nil, true, 'Real-wallet stakes minus wins in the selected currency.'),
    parameter('net_cash_flow', 'Net cash flow', 'Finance', 'number', nil, true, 'Deposits minus withdrawals in the selected currency over the selected number of days.'),
    parameter('number_of_deposits', 'Number of deposits', 'Finance', 'number'),
    parameter('deposit_frequency', 'Lifetime deposit frequency', 'Finance', 'number', nil, false, 'Deposits per week since registration, across currencies.'),
    parameter('real_balance', 'Real balance', 'Finance', 'number', nil, true),
    parameter('bonus_balance', 'Bonus balance', 'Finance', 'number', nil, true),
    parameter('win_over_loss', 'Win over loss', 'Gaming', 'number', nil, true, 'Wins minus real-wallet stakes in the selected currency.'),
    parameter('favourite_game', 'Favourite game', 'Gaming', 'list', ['Gates of Olympus', 'Sweet Bonanza', 'Book of Dead', 'European Roulette', 'Aviator', 'Live Blackjack']),
    parameter('favourite_category', 'Favourite game category', 'Gaming', 'list', ['Slots', 'Table games', 'Crash', 'Live casino']),
    parameter('favourite_provider', 'Favourite game provider', 'Gaming', 'list', ['Pragmatic Play', "Play'n GO", 'NetEnt', 'Spribe', 'Evolution']),
    parameter('favourite_type', 'Favourite game type', 'Gaming', 'list', ['Slots', 'Table games', 'Crash', 'Live casino'], false, 'Uses the demo category as the game type.'),
    parameter('average_bet', 'Average bet size', 'Gaming', 'number', nil, true),
    parameter('bonus_wr_rate', 'Bonus wagering completion rate (%)', 'Bonus & loyalty', 'number', nil, false, 'Demo percentage; live completion calculation is not connected.'),
    parameter('loyalty_points', 'Loyalty points', 'Bonus & loyalty', 'number'),
    parameter('risk_rdw', 'Risk flag: RDW', 'Risk', 'boolean', nil, false, 'Rapid deposit and withdrawal cycles; demo review flag.'),
    parameter('rdw_rate', 'RDW deposits / withdrawals rate', 'Risk', 'number', nil, false, 'Deposit count divided by withdrawal count; unavailable without withdrawals.'),
    parameter('risk_bonus_abuse', 'Risk flag: Bonus Abuser', 'Risk', 'boolean'),
    parameter('risk_multiple_payment_methods', 'Risk flag: Multiple payment methods', 'Risk', 'boolean'),
    parameter('risk_abnormal_activity', 'Risk flag: Abnormal activity', 'Risk', 'boolean'),
    parameter('risk_failed_kyc_attempts', 'Risk flag: Failed KYC attempts', 'Risk', 'boolean'),
    parameter('risk_multiple_ips', 'Risk flag: Multiple IPs', 'Risk', 'boolean')
  ].freeze
  BY_KEY = PARAMETERS.map { |p| [p['key'], p] }.to_h.freeze
  OPERATORS = {
    'list' => %w[IS = !=], 'boolean' => %w[IS = !=],
    'number' => ['IS', '<', '>', '!=', '=', '>=', '<=', '=<'],
    'date' => ['IS', '<', '>', '!=', '=', '>=', '<=', '=<']
  }.freeze
  SEEDS = [
    {
      'id' => 'SG-1001', 'name' => 'REGISTERED',
      'rules' => { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [
        { 'kind' => 'rule', 'field' => 'funnel_status', 'operator' => 'IS', 'value' => %w[Registered FTD Trusted VIP Dormant], 'not' => false }
      ] }
    },
    {
      'id' => 'SG-1002', 'name' => 'VIP',
      'rules' => { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [
        { 'kind' => 'rule', 'field' => 'funnel_status', 'operator' => 'IS', 'value' => ['VIP'], 'not' => false }
      ] }
    },
    {
      'id' => 'SG-1003', 'name' => 'KYC_VERIFIED',
      'rules' => { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [
        { 'kind' => 'rule', 'field' => 'kyc_status', 'operator' => 'IS', 'value' => ['VERIFIED'], 'not' => false }
      ] }
    },
    {
      'id' => 'SG-1004', 'name' => 'COUNTRY_[DE, AT]_GGR_G_500_NOT_BONUS_ABUSER',
      'rules' => { 'kind' => 'group', 'operator' => 'AND', 'not' => false, 'children' => [
        { 'kind' => 'rule', 'field' => 'country', 'operator' => 'IS', 'value' => %w[DE AT], 'not' => false },
        { 'kind' => 'rule', 'field' => 'lifetime_ggr', 'operator' => '>', 'value' => 500, 'currency' => 'EUR', 'not' => false },
        { 'kind' => 'rule', 'field' => 'risk_bonus_abuse', 'operator' => 'IS', 'value' => true, 'not' => true }
      ] }
    }
  ].freeze

  def self.validate(body, parameters = PARAMETERS)
    errors = {}
    (body.keys - %w[name rules]).each { |k| errors[k] = 'Unknown or read-only field' }
    name = body['name']
    errors['name'] = 'Supply a name of 1 to 200 characters' unless name.is_a?(String) && name.strip.length.between?(1, 200)
    count = [0]
    validate_node(body['rules'], 'rules', 0, count, errors, parameters.map { |parameter| [parameter['key'], parameter] }.to_h)
    [errors.empty? ? { 'name' => name.strip, 'rules' => normalize(body['rules']) } : nil, errors]
  end

  def self.normalize(node)
    return node.merge('children' => node['children'].map { |child| normalize(child) }) if node['kind'] == 'group'
    node.merge('operator' => node['operator'] == '<=' ? '=<' : node['operator'])
  end

  def self.validate_node(node, path, depth, count, errors, by_key = BY_KEY)
    count[0] += 1
    if depth > 5 || count[0] > 100
      errors[path] = 'Maximum depth is 5 and maximum total rule/group count is 100'
      return
    end
    unless node.is_a?(Hash)
      errors[path] = 'A rule or group object is required'
      return
    end
    errors["#{path}.not"] = 'Expected true or false' unless [true, false].include?(node['not'])
    if node['kind'] == 'group'
      (node.keys - %w[kind operator not children]).each { |k| errors["#{path}.#{k}"] = 'Unknown field' }
      errors["#{path}.operator"] = 'Choose AND or OR' unless %w[AND OR].include?(node['operator'])
      children = node['children']
      unless children.is_a?(Array) && children.length.between?(1, 100)
        errors["#{path}.children"] = 'Add between 1 and 100 rules or groups'
        return
      end
      children.each_with_index { |child, i| validate_node(child, "#{path}.children.#{i}", depth + 1, count, errors, by_key) }
      return
    end
    unless node['kind'] == 'rule' && (parameter = by_key[node['field']])
      errors[path] = 'Choose a supported segmentation parameter'
      return
    end
    allowed = %w[kind field operator value not]
    allowed << 'currency' if parameter['money']
    allowed << 'days' if node['field'] == 'net_cash_flow'
    (node.keys - allowed).each { |k| errors["#{path}.#{k}"] = 'Unknown field' }
    errors["#{path}.operator"] = 'Operator is not supported for this parameter' unless OPERATORS[parameter['type']].include?(node['operator'])
    if allowed.include?('currency') && !CustomerStore::CURRENCIES.include?(node['currency'])
      errors["#{path}.currency"] = 'Choose a supported currency'
    end
    if allowed.include?('days') && !(node['days'].is_a?(Integer) && node['days'].between?(1, 36500))
      errors["#{path}.days"] = 'Choose a whole number of days between 1 and 36500'
    end
    value = node['value']
    valid = case parameter['type']
            when 'list'
              value.is_a?(Array) && value.length.between?(1, parameter['options'].length) &&
                value.uniq == value && value.all? { |v| parameter['options'].include?(v) }
            when 'boolean' then value == true || value == false
            when 'number' then value.is_a?(Numeric) && value.finite?
            when 'date'
              begin
                value.is_a?(String) && Date.iso8601(value).iso8601 == value
              rescue ArgumentError
                false
              end
            end
    errors["#{path}.value"] = 'Supply a valid value for this parameter' unless valid
  end
end
