import os
import re
from pathlib import Path

database, user, password = (os.environ[key] for key in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"))
if not all(re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}", value) for value in (database, user)):
    raise ValueError("Use simple PostgreSQL database/user identifiers.")
if not password or any(c in password for c in "\r\n\0"):
    raise ValueError("Set a nonempty single-line PostgreSQL password.")
quoted_password = password.replace("\\", "\\\\").replace('"', '\\"')
auth = Path("/tmp/cms-pool-users")
auth.write_text(f'"{user}" "{quoted_password}"\n')
auth.chmod(0o600)
config = Path("/tmp/cms-pgbouncer.ini")
config.write_text(f"""[databases]
{database} = host=db port=5432 dbname={database}
[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
unix_socket_dir = /tmp
auth_type = scram-sha-256
auth_file = {auth}
pool_mode = transaction
max_client_conn = 300
default_pool_size = 20
reserve_pool_size = 5
server_reset_query = DISCARD ALL
server_idle_timeout = 60
pidfile = /tmp/cms-pgbouncer.pid
logfile =
""")
config.chmod(0o600)
os.execvp("pgbouncer", ["pgbouncer", str(config)])
