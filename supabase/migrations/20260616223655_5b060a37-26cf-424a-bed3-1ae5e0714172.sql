ALTER TABLE public.item_costs ADD COLUMN IF NOT EXISTS note TEXT;

INSERT INTO public.item_costs (item_name, cost_exvat, effective_from, note)
SELECT v.item_name, v.cost_exvat, DATE '2025-01-01', v.note
FROM (
  VALUES
    ('TGR Smash Burger (With Fries)', 3.18, 'Fries option'),
    ('TGR Smash Burger (With Salad)', 2.93, 'Salad option'),
    ('TGR Smash Burger',             3.18, 'FALLBACK when report shows no side option (= With Fries cost)'),
    ('Roast Beef Au Jus',            2.81, NULL),
    ('Fish Filet',                   5.36, 'platform spelling Filet (Shopify: Fillet)'),
    ('Basterma Bikini',              2.91, NULL),
    ('Gambas Al Pil Pil',            2.64, 'platform spelling includes Al'),
    ('Whipped Butter',               0.74, NULL),
    ('Nuts, Olives & Pickles',       1.60, NULL),
    ('Spicy Smashed Cucumbers',      0.34, NULL),
    ('Corn Ribs',                    1.02, NULL),
    ('TGR Fries',                    0.85, NULL),
    ('Very Green Salad',             1.19, NULL),
    ('Salt & Vinegar Potato Salad',  1.19, NULL),
    ('Beetroot & Lentils Salad',     0.62, 'Careem uses &, Talabat uses and'),
    ('Beetroot and Lentils',         0.62, 'Talabat spelling alias of Beetroot & Lentils Salad (no Salad suffix) - same item/cost'),
    ('Whole Eggplant',               0.93, NULL),
    ('Soy Braised Octopus',          1.12, NULL),
    ('Salt & Pepper Chicken Wings',  0.98, 'Talabat appends (12pcs)'),
    ('MB7 Wagyu',                    5.24, NULL),
    ('Beef Bresaola & Salami',       4.59, 'Careem uses &, Talabat uses and'),
    ('Assorted Cheese Plate',        6.93, NULL),
    ('Caramelized Brie',             2.26, NULL),
    ('Creme Caramel',                0.62, NULL),
    ('G Cola',                       0.40, NULL),
    ('G Cola (Sugar Free)',          0.39, 'Talabat only'),
    ('G Lemon Lime',                 0.37, NULL),
    ('G Lemon Lime (Sugar Free)',    0.36, 'Talabat only'),
    ('G Berry Fusion',               0.38, NULL),
    ('G Orange Passion',             0.28, NULL),
    ('Red Bull',                     1.07, 'single-can cost (not 4-pack)'),
    ('Red Bull Sugar Free',          1.07, 'single-can cost'),
    ('Solan Still 300ml',            0.39, NULL),
    ('Solan Sparkling 330ml',        0.81, NULL),
    ('Double Smash Burger',          6.76, 'ESTIMATE - 2x Smash Burger 3.18 + drink 0.40'),
    ('Wings & Things',               3.65, 'ESTIMATE - Wings 0.98 + Corn Ribs 1.02 + Fries 0.85 + 2 drinks 0.80'),
    ('Three''s Company',            10.63, 'ESTIMATE - 2x Burger 6.36 + Fries 0.85 + Corn Ribs 1.02 + Wings 0.98 + 2 drinks 0.80 + Creme Caramel 0.62'),
    ('We''re Not Hungry Combo',      2.95, 'ESTIMATE - Cucumbers 0.34 + Corn Ribs 1.02 + Whipped Butter 0.74 + Fries 0.85')
) AS v(item_name, cost_exvat, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.item_costs ic
  WHERE ic.item_name = v.item_name AND ic.effective_from = DATE '2025-01-01'
);