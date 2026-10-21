require 'minitest/autorun'
require_relative '../finance'

class FinanceHarness
  include FinanceStore
  attr_reader :state

  def initialize(include_history: true, casino_id: 'casino-one')
    @casino_id = casino_id
    @state = { 'finance' => FinanceStore.seed(include_history: include_history), 'segments' => [] }
    @state['finance'].each_value do |records|
      records.each { |record| record['casino_id'] = @casino_id }
    end
    @state['games'] = {
      'games' => @state['finance']['game_catalog'].each_with_index.map do |game, index|
        { 'id' => "G-#{index}", 'name' => game['name'], 'publisher_id' => "P-#{index}", 'category' => "C-#{index}", 'casino_id' => @casino_id }
      end,
      'categories' => @state['finance']['game_catalog'].each_with_index.map { |game, index| { 'id' => "C-#{index}", 'name' => game['category'], 'casino_id' => @casino_id } }
    }
    @state['catalogs'] = { 'providers' => @state['finance']['game_catalog'].each_with_index.map { |game, index| { 'id' => "P-#{index}", 'name' => game['provider'], 'casino_id' => @casino_id } } }
  end
end

class FinanceStoreTest < Minitest::Test
  def setup
    @store = FinanceHarness.new
  end

  def connection_body
    @store.finance_data['connections'].first.slice(*FinanceStore::CONNECTION_FIELDS)
  end

  def cascade_body
    @store.finance_data['cascades'].first.slice(*FinanceStore::CASCADE_FIELDS)
  end

  def test_original_fixture_and_customer_history_are_preserved
    data = @store.finance_data
    assert_equal FinanceStore::COLLECTION_KEYS.sort, data.keys.sort
    assert_equal [26, 26, 8, 48, 554, 120, 12, 6], FinanceStore::COLLECTION_KEYS.map { |key| data[key].length }
    assert data['transactions'].all? { |row| row['logs'].length >= 4 }
    assert data['wallet_transactions'].all? { |row| data['wallets'].any? { |wallet| wallet['id'] == row['wallet'] } }
    assert data['wallets'].all? { |wallet| wallet['customer_id'].match?(/\ACU-\d+\z/) }
  end

  def test_configuration_clone_has_no_history_or_payment_secrets
    data = FinanceStore.seed(include_history: false)
    FinanceStore::HISTORY_KEYS.each { |key| assert_empty data[key] }
    assert data['connections'].all? { |row| row['settings'].empty? && !row['enabled'] && row['configuration_required'] && row['conn'] == 'offline' }
    assert data['cascades'].all? { |row| !row['enabled'] && row['configuration_required'] }
    assert data['gateways'].all? { |row| row['conn'] == 'offline' }
    assert_empty data['game_catalog']
  end

  def test_seed_and_read_results_do_not_alias_private_state
    data = @store.finance_data
    data['connections'][0]['settings']['secret_key'] = 'changed'
    refute_equal 'changed', @store.finance_data['connections'][0]['settings']['secret_key']
    FinanceStore.seed['connections'].clear
    assert_equal 26, FinanceStore.seed['connections'].length
  end

  def test_connection_create_patch_and_server_owned_fields
    saved, errors = @store.save_finance('connections', nil, connection_body.merge('name' => 'New terminal'))
    assert_empty errors
    assert_kind_of Integer, saved['id']
    assert_equal 'casino-one', saved['casino_id']
    assert_equal 'New terminal', saved['name']
    patched, errors = @store.save_finance('connections', saved['id'].to_s, { 'name' => 'Renamed terminal' })
    assert_empty errors
    assert_equal saved['created_at'], patched['created_at']
    assert_equal saved['settings'], patched['settings']
    patched['settings']['secret_key'] = 'not stored'
    refute_equal 'not stored', @store.finance_data['connections'].last['settings']['secret_key']
    %w[id casino_id created_at updated_at].each do |field|
      record, problems = @store.save_finance('connections', saved['id'], { field => 'foreign' })
      assert_nil record
      assert problems.key?(field)
    end
  end

  def test_failed_validation_leaves_state_unchanged
    before = @store.finance_data
    saved, errors = @store.save_finance('connections', 1, { 'name' => '', 'countries' => ['ZZ'], 'settings' => [] })
    assert_nil saved
    assert errors.key?('name')
    assert errors.key?('countries')
    assert errors.key?('settings')
    assert_equal before, @store.finance_data
  end

  def test_foreign_ids_gateways_and_cascade_references_are_rejected
    @store.state['finance']['connections'][0]['casino_id'] = 'other'
    assert_nil @store.save_finance('connections', 1, { 'name' => 'Hijack' }).first
    assert_nil @store.save_finance('connections', 999, { 'name' => 'Unknown' }).first
    assert_nil @store.save_finance('cascades', 1, cascade_body).first
    @store.state['finance']['gateways'][0]['casino_id'] = 'other'
    assert_nil @store.save_finance('connections', nil, connection_body.merge('name' => 'Foreign brand')).first
  end

  def test_cascade_thresholds_names_and_connection_ids_are_validated
    assert_empty @store.save_finance('cascades', 1, cascade_body).last
    body = cascade_body.merge('type' => 'success', 'steps' => [{ 'psp' => 'Foreign terminal', 'value' => 110 }])
    saved, errors = @store.save_finance('cascades', 1, body)
    assert_nil saved
    assert errors.key?('steps.0')
    assert errors.key?('steps.0.value')
    body['steps'] = [{ 'psp' => connection_body['name'], 'connection_id' => 2, 'value' => 90 }]
    assert_nil @store.save_finance('cascades', 1, body).first
    body['steps'] = [{ 'psp' => connection_body['name'], 'connection_id' => 1, 'value' => 90 }]
    assert_empty @store.save_finance('cascades', 1, body).last
  end

  def test_connection_rename_preserves_cascade_links_and_delete_guards_them
    saved, errors = @store.save_finance('connections', 1, { 'name' => 'Renamed Stripe' })
    assert_empty errors
    assert_equal 'Renamed Stripe', saved['name']
    assert_equal 'Renamed Stripe', @store.finance_data['cascades'][0]['steps'][0]['psp']
    assert_nil @store.delete_finance('connections', 1).first
    assert @store.delete_finance('cascades', 1).first
    saved, errors = @store.save_finance('connections', nil, connection_body.merge('name' => 'Unused terminal'))
    assert_empty errors
    assert @store.delete_finance('connections', saved['id']).first
  end

  def test_cloned_connections_cannot_enable_without_credentials
    clone = FinanceHarness.new(include_history: false)
    saved, errors = clone.save_finance('connections', 1, { 'conn' => 'online', 'configuration_required' => false, 'enabled' => true })
    assert_nil saved
    assert errors.key?('settings')
    saved, errors = clone.save_finance('connections', 1, { 'conn' => 'offline' })
    assert_empty errors
    assert saved['configuration_required']
    refute saved['enabled']
    cascade, errors = clone.save_finance('cascades', 1, cascade_body)
    assert_empty errors
    refute cascade['enabled']
    assert cascade['configuration_required']
  end

  def test_only_casino_local_segment_names_can_be_saved
    @store.state['segments'] = [{ 'name' => 'Local audience', 'casino_id' => 'casino-one' }, { 'name' => 'Foreign audience', 'casino_id' => 'casino-two' }]
    assert_empty @store.save_finance('connections', 1, { 'segments' => ['Local audience'] }).last
    assert_nil @store.save_finance('connections', 1, { 'segments' => ['Foreign audience'] }).first
    assert_nil @store.save_finance('wallets', nil, {}).first
    assert_nil @store.save_finance('connections', nil, []).first
  end

  def test_delete_adapter_requires_existing_id_and_rejects_other_fields
    assert_nil @store.save_finance('cascades', nil, { '_delete' => true }).first
    assert_nil @store.save_finance('cascades', 1, { '_delete' => true, 'name' => 'Ignored' }).first
    assert_nil @store.save_finance('cascades', 'missing', { '_delete' => true }).first
    saved, errors = @store.save_finance('cascades', '1', { '_delete' => true })
    assert_empty errors
    assert_equal 1, saved['id']
    refute @store.finance_data['cascades'].any? { |record| record['id'] == 1 }
  end

  def test_game_catalog_is_derived_only_from_current_tenant_games
    @store.state['finance']['game_catalog'] = [{ 'name' => 'Stale global game' }]
    @store.state['games']['games'][0]['name'] = 'Renamed tenant game'
    @store.state['games']['games'][1]['casino_id'] = 'foreign'
    @store.state['catalogs']['providers'][0]['name'] = 'Renamed provider'
    @store.state['games']['categories'][0]['name'] = 'Renamed category'
    catalog = @store.finance_data['game_catalog']
    assert_equal 5, catalog.length
    assert_equal({
      'id' => 'G-0', 'casino_id' => 'casino-one', 'name' => 'Renamed tenant game',
      'category' => 'Renamed category', 'provider' => 'Renamed provider'
    }, catalog.first)
    assert catalog.all? { |game| game['casino_id'] == 'casino-one' }
    refute catalog.any? { |game| game['name'] == 'Stale global game' }
    @store.state['games']['games'] = []
    assert_empty @store.finance_data['game_catalog']
    @store.state.delete('games')
    assert_empty @store.finance_data['game_catalog']
  end
end
