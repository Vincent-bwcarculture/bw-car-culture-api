// DEVELOPMENT MOCK DATA — parts taken from the Golf 8.5 R display model (hero-golf.glb).
// meshMatch lists name fragments of the model's meshes so the simulator can highlight each part.
// Pricing is component data (configurable terms), never a hard-coded customer price.
// Replace with the `parts` MongoDB collection in Phase 0/1.
const GOLF = 'vw-golf-8-5-r';
const fitGolf = { vehicleModelIds: [GOLF], make: 'Volkswagen', models: ['Golf R'], years: { from: 2024, to: null } };
const supplied = (cost, delivery, marginPct = 18) => ({ source: 'supplier', cost, delivery, designerFee: 0, marginPct });
const designer = (cost, delivery, designerFee, marginPct = 15) => ({ source: 'designer', cost, delivery, designerFee, marginPct });

export const CONFIGURATOR_MOCK_PARTS = [
  { id: 'golf85r-rims-19-estoril', name: '19" Estoril alloy wheels (set of 4)', category: 'Wheels & tyres',
    description: 'OEM-pattern 19-inch alloys in the R design, supplied with centre caps and bolts.',
    meshMatch: ['Rim_'], leadTimeDays: 10, pricing: supplied(21500, 1200) },
  { id: 'golf85r-tyres-pzero', name: 'Performance tyres 235/35 R19 (set of 4)', category: 'Wheels & tyres',
    description: 'Summer performance tyres in the factory size, fitted and balanced.',
    meshMatch: ['Tire_'], leadTimeDays: 5, pricing: supplied(9800, 600) },
  { id: 'golf85r-calipers-r', name: 'R brake calipers — blue (front & rear)', category: 'Brakes',
    description: 'Four-piston front and matching rear calipers finished in R blue with logo.',
    meshMatch: ['Caliper', 'Calliper', 'Brake_FL_R_Logo', 'Brake_FR_R_Logo'], leadTimeDays: 14, pricing: supplied(14200, 900) },
  { id: 'golf85r-discs-drilled', name: 'Cross-drilled brake discs (front & rear)', category: 'Brakes',
    description: 'Ventilated, cross-drilled discs for improved heat dissipation.',
    meshMatch: ['Rotor', 'Brake_Rear_Discs'], leadTimeDays: 12, pricing: supplied(8600, 700) },
  { id: 'golf85r-exhaust-quad', name: 'R quad-tip performance exhaust', category: 'Performance',
    description: 'Stainless cat-back system with four tips, valved for a sportier sound.',
    meshMatch: ['Exhaust_System'], leadTimeDays: 21, pricing: supplied(32500, 1500) },
  { id: 'golf85r-mirror-caps-carbon', name: 'Carbon fibre mirror caps (designer)', category: 'Exterior',
    description: 'Designer-made twill carbon caps, manufactured to order by a partner workshop.',
    meshMatch: ['Ext_Door_FL_Mirror', 'Ext_Door_FR_Mirror'], leadTimeDays: 18, pricing: designer(2900, 400, 850) },
  { id: 'golf85r-grille-r-accent', name: 'Front grille with blue R accent line', category: 'Exterior',
    description: 'Gloss-black honeycomb grille with the illuminated-style blue accent strip.',
    meshMatch: ['GrilleInterior', 'Grill_R_Blue'], leadTimeDays: 10, pricing: supplied(6400, 500) },
  { id: 'golf85r-headlights-iq', name: 'IQ.LIGHT LED matrix headlights (pair)', category: 'Lighting',
    description: 'LED matrix units with animated daytime running lights.',
    meshMatch: ['Ext_Lights_Glass', 'Ext_Lights_Glow', 'Ext_Lights_Chrome', 'Ext_Lights_Black'], leadTimeDays: 25, pricing: supplied(38900, 1400) },
  { id: 'golf85r-taillights-led', name: 'LED tail light clusters (pair)', category: 'Lighting',
    description: 'Full LED rear clusters with dynamic indicators.',
    meshMatch: ['Taillight', 'Trunk_Lid_Light'], leadTimeDays: 15, pricing: supplied(12800, 800) },
  { id: 'golf85r-sunroof-tinted', name: 'Tinted panoramic sunroof glass', category: 'Exterior',
    description: 'Privacy-tinted replacement panel for the panoramic roof.',
    meshMatch: ['Sunroof'], leadTimeDays: 20, pricing: supplied(11200, 1600) },
  { id: 'golf85r-seats-r-nappa', name: 'R performance seats — Nappa trim (front pair)', category: 'Interior',
    description: 'Retrim of the front R seats in Nappa leather with blue stitching.',
    meshMatch: ['Int_Seats'], leadTimeDays: 30, pricing: supplied(24500, 1100, 20) },
  { id: 'golf85r-wheel-r-alcantara', name: 'R steering wheel — Alcantara (designer)', category: 'Interior',
    description: 'Designer Alcantara rim with blue 12 o\'clock marker, built to order.',
    meshMatch: ['Int_SW'], leadTimeDays: 21, pricing: designer(4200, 350, 1200) }
].map(part => ({ ...part, fitment: fitGolf, currency: 'BWP', performance: null, status: 'published', mock: true }));
