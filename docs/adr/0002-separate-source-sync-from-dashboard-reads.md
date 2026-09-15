# Separate bracelet synchronization from dashboard reads

Bracelet synchronization is an explicit, single-flight, atomic operation for a selected date range, while dashboard reads never mutate data. FastAPI starts each operation as a separate Python process; this preserves the script boundary, prevents page loads from changing the database, and lets a failed synchronization leave the previous dashboard state intact.

The dashboard also provides an explicit, single-flight dashboard source synchronization operation. It attempts each displayed source independently so a failed or unavailable source does not prevent the others from updating. Bracelet and all-source synchronization share the same lock; ordinary dashboard reads remain read-only.
