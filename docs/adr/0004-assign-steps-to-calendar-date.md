# Assign Bracelet steps to calendar date

The 05:00 Europe/Moscow logical-day boundary exists to associate after-midnight work and other effort with the preceding date. Bracelet step totals instead follow the Europe/Moscow calendar date so they match the daily convention used by the Bracelet application.

Reva Health Exporter files may overlap. When multiple files contain revisions of the same step interval from the same data origin, reports and the dashboard use the count from the most recently modified export. This keeps source projections intact for provenance while preventing overlapping revisions from inflating the presented total.
