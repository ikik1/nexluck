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
    %w[profiles.json credentials.json].each { |name| assert_equal 0600, File.stat(File.join(@dir, name)).mode & 0777 }
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
    profiles.each_value { |profile| %w[funnel_status activity risk_indicators].each { |key| profile.delete(key) } }
    File.write(File.join(@dir, 'profiles.json'), JSON.generate(profiles))
    restored = CustomerStore.new.find('CU-1001')
    assert_equal 'Saved customer', restored['name']
    assert_equal saved['updated_at'], restored['updated_at']
    assert_equal CUSTOMER_OBJECTS.first['funnel_status'], restored['funnel_status']
    assert_equal CUSTOMER_OBJECTS.first['activity'], restored['activity']
    assert_equal CUSTOMER_OBJECTS.first['risk_indicators'], restored['risk_indicators']
  end

  def test_validation_is_atomic
    before = @store.find('CU-1001').dup
    [
      { 'risk_score' => -1 }, { 'risk_score' => 101 }, { 'risk_score' => 2.5 },
      { 'birthday' => '2026-02-30' }, { 'birthday' => (Date.today + 1).iso8601 },
      { 'name' => '' }, { 'external_id' => 'PLAYER-5002' }, { 'info' => 'x' * 4001 },
      { 'mfa_type' => 'FAKE' }, { 'country' => nil }, { 'currency' => 'FAKE' },
      { 'id' => 'CU-9999' }, { 'created_at' => 'now' }, { 'updated_at' => 'now' },
      { 'password' => SecureRandom.hex(16) }, { 'activity' => {} }, { 'risk_indicators' => [] }
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
end
