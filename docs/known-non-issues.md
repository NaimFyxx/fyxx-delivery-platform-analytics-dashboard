# Known non-issues

Findings that looked like bugs in one or more reviews but are confirmed not to be. Recorded here so
they are not chased again. Add to this list whenever a flagged item turns out to be a measurement or
tooling artefact rather than a real defect.

## "Salt & Pepper ChickenWings" missing space in the Top 10 axis label

**Status: not a bug. Do not chase.** Flagged in three consecutive reviews (chart colour audit, mobile
review, and the 2026-09-09 verification).

The item name is correct in the data and on screen. It is stored with the space and renders with the
space. What looked like a missing space is an artefact of reading the Recharts SVG axis label out of
the DOM: a long tick label is wrapped across two `<tspan>` elements, and concatenating their text
content drops the space at the wrap point. So a DOM scrape reads "ChickenWings" while the chart shows
"Chicken Wings".

Evidence: the Top 10 chart axis and the table below it both render the same `r.item` string (no
display transform), and this read-only query returned zero rows, confirming no stored name has a
missing space:

```sql
select 'monthly_item_sales' as source, item_name as name, count(*) as rows
from monthly_item_sales
where item_name ~ '[a-z][A-Z]' or item_name ilike '%chickenwings%'
group by item_name
union all
select 'item_aliases.raw_name', raw_name, count(*)
from item_aliases
where raw_name ~ '[a-z][A-Z]' or raw_name ilike '%chickenwings%'
group by raw_name
union all
select 'item_aliases.canonical_name', canonical_name, count(*)
from item_aliases
where canonical_name ~ '[a-z][A-Z]' or canonical_name ilike '%chickenwings%'
order by 1, 2;
```

If a future audit reads run-together words out of any Recharts tick label, suspect the `<tspan>` wrap
first and check the rendered chart and the data before treating it as a defect.
