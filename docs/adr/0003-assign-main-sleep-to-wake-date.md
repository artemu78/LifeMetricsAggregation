# Assign the main sleep session to its wake date

The 05:00 Europe/Moscow logical-day boundary applies to work, tasks, activity, and other non-sleep measurements so after-midnight effort remains associated with the preceding date.

Bracelet sleep uses different attribution. For each Moscow calendar date, reports and the dashboard select the longest sleep session ending on that date, sum its non-awake stages, and present the complete duration. Shorter sessions ending on the same date are treated as naps and do not change the nightly sleep value.

This matches the Bracelet application's nightly totals without changing the logical-day behavior that exists for effort calculations.
