import sqlite3
import os

db_path = "factorymind_database.db"

print("Current folder:", os.getcwd())
print("Database exists:", os.path.exists(db_path))

if not os.path.exists(db_path):
    print("ERROR: Database file not found")
    exit()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("\nTables in database:")
cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    ORDER BY name
""")

tables = cursor.fetchall()

if not tables:
    print("No tables found.")
else:
    for table in tables:
        print("-", table[0])

conn.close()
print("\nDatabase check completed.")
