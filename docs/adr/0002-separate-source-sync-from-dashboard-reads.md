# Separate bracelet synchronization from dashboard reads

Bracelet synchronization is an explicit, single-flight, atomic operation for a selected date range, while dashboard reads never mutate data. FastAPI starts each operation as a separate Python process; this preserves the script boundary, prevents page loads from changing the database, and lets a failed synchronization leave the previous dashboard state intact.
