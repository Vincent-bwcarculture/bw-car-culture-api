// DEVELOPMENT MOCK DATA — parts taken from the Golf 8.5 R display model (hero-golf.glb).
// meshMatch: name fragments of the model meshes the part replaces.
// view: how the Config Simulator frames it — corner | top | interior | exterior.
// viewFrom: optional fixed viewing direction; reveal: meshes made see-through while it is shown.
// pictureContext 'car': the product picture shows the part on the car instead of on its own.
// appearance: the finish shown once the part is fitted; rules apply to meshes whose name
//   contains `match` (or all of the part's meshes when match is omitted).
// Pricing is component data (configurable terms), never a hard-coded customer price.
// Replace with the `parts` MongoDB collection in Phase 0/1.
const GOLF = 'vw-golf-8-5-r';
const fitGolf = { vehicleModelIds: [GOLF], make: 'Volkswagen', models: ['Golf R'], years: { from: 2024, to: null } };
const supplied = (cost, delivery, marginPct = 18) => ({ source: 'supplier', cost, delivery, designerFee: 0, marginPct });
const designer = (cost, delivery, designerFee, marginPct = 15) => ({ source: 'designer', cost, delivery, designerFee, marginPct });

const SIDE_AND_REAR_GLASS = [
  'Ext_Door_FL_Windows', 'Ext_Door_FR_Windows', 'Ext_Door_RL_Windows', 'Ext_Door_RR_Windows',
  'Ext_Body_Window_Windows', 'Ext_Window_Rear_Windows', 'Int_Door_FL_Glass', 'Int_Door_FR_Glass',
  'Int_Door_RL_Glass', 'Int_Door_RR_Glass', 'Int_Body_Window_Glass', 'Int_Window_Rear_Glass'
];

export const CONFIGURATOR_MOCK_PARTS = [
  { id: 'golf85r-rims-19-estoril', name: '19" Estoril alloy wheels — bright silver (set of 4)', category: 'Wheels & tyres',
    description: '19-inch R-design alloys in bright silver, supplied with centre caps and bolts.',
    meshMatch: ['Rim_'], view: 'corner', leadTimeDays: 10, pricing: supplied(21500, 1200),
    appearance: [{ color: '#c9ced6', metalness: 0.85, roughness: 0.22 }] },
  { id: 'golf85r-tyres-pzero', name: 'Performance tyres 235/35 R19 (set of 4)', category: 'Wheels & tyres',
    description: 'Summer performance tyres in the factory size, fitted and balanced.',
    meshMatch: ['Tire_'], view: 'corner', leadTimeDays: 5, pricing: supplied(9800, 600),
    appearance: [{ color: '#121212', roughness: 0.95 }] },
  { id: 'golf85r-calipers-r', name: 'R brake calipers — blue (front & rear)', category: 'Brakes',
    description: 'Four-piston front and matching rear calipers finished in R blue with logo.',
    meshMatch: ['Caliper', 'Calliper', 'Brake_FL_R_Logo', 'Brake_FR_R_Logo'], view: 'corner', reveal: ['Rim_', 'Tire_'], leadTimeDays: 14,
    pricing: supplied(14200, 900), appearance: [{ color: '#1d4ed8', metalness: 0.3, roughness: 0.35 }] },
  { id: 'golf85r-discs-drilled', name: 'Cross-drilled brake discs (front & rear)', category: 'Brakes',
    description: 'Ventilated, cross-drilled discs for improved heat dissipation.',
    meshMatch: ['Rotor', 'Brake_Rear_Discs'], view: 'corner', reveal: ['Rim_', 'Tire_'], leadTimeDays: 12, pricing: supplied(8600, 700),
    appearance: [{ color: '#9aa1a9', metalness: 0.95, roughness: 0.3 }] },
  { id: 'golf85r-exhaust-quad', name: 'R quad-tip performance exhaust — titanium', category: 'Performance',
    description: 'Stainless cat-back system with four burnt-titanium tips, valved for a sportier sound.',
    meshMatch: ['Exhaust_System'], leadTimeDays: 21, pricing: supplied(32500, 1500),
    appearance: [{ color: '#5a6b86', metalness: 1, roughness: 0.25 }] },
  { id: 'golf85r-window-tint-35', name: 'Window tint film — 35% (side & rear windows)', category: 'Glass & tint',
    description: 'Ceramic heat-rejection film on all side and rear windows, fitted by a partner installer.',
    meshMatch: SIDE_AND_REAR_GLASS, viewFrom: [1, 0.3, -0.15], pictureContext: 'car', leadTimeDays: 3, pricing: supplied(2600, 0, 25),
    appearance: [{ color: '#05080c', opacity: 0.85 }] },
  { id: 'golf85r-windscreen-film-70', name: 'Windscreen heat-rejection film — 70%', category: 'Glass & tint',
    description: 'Near-clear ceramic film for the windscreen; cuts heat and glare within legal limits.',
    meshMatch: ['Windshield'], pictureContext: 'car', leadTimeDays: 3, pricing: supplied(1400, 0, 25),
    appearance: [{ color: '#1e293b', opacity: 0.5 }] },
  { id: 'golf85r-sunroof-tinted', name: 'Tinted panoramic sunroof glass', category: 'Glass & tint',
    description: 'Privacy-tinted replacement panel for the panoramic roof.',
    meshMatch: ['Sunroof'], view: 'top', pictureContext: 'car', leadTimeDays: 20, pricing: supplied(11200, 1600),
    appearance: [{ color: '#030303', opacity: 0.92 }] },
  { id: 'golf85r-mirror-glass-blue', name: 'Blue anti-glare mirror glass (pair)', category: 'Exterior',
    description: 'Heated, blue-tinted wide-angle mirror glass that cuts headlight glare.',
    meshMatch: ['Ext_Door_FL_Mirror', 'Ext_Door_FR_Mirror'], view: 'corner', viewFrom: [0.9, 0.35, -1], pictureContext: 'car', leadTimeDays: 7, pricing: supplied(1900, 300),
    appearance: [{ color: '#60a5fa', metalness: 0.3, roughness: 0.08 }] },
  { id: 'golf85r-badges-carbon', name: 'Carbon-look R badge set (designer)', category: 'Exterior',
    description: 'Designer-made carbon-effect R badges for doors and tailgate, manufactured to order.',
    meshMatch: ['Ext_Door_FL_Badge', 'Ext_Door_FR_Badge', 'R_LogoBlack'], pictureContext: 'car', leadTimeDays: 18, pricing: designer(1100, 250, 600),
    appearance: [{ color: '#2b2b2b', metalness: 0.4, roughness: 0.3 }] },
  { id: 'golf85r-grille-r-accent', name: 'Illuminated blue R grille accent', category: 'Exterior',
    description: 'Gloss-black honeycomb grille with an illuminated blue accent strip.',
    meshMatch: ['GrilleInterior', 'Grill_R_Blue'], pictureContext: 'car', leadTimeDays: 10, pricing: supplied(6400, 500),
    appearance: [{ match: 'Grill_R_Blue', color: '#3b82f6', emissive: '#2563eb', emissiveIntensity: 2 },
      { match: 'GrilleInterior', color: '#0a0a0a', roughness: 0.2 }] },
  { id: 'golf85r-headlights-iq', name: 'IQ.LIGHT LED matrix headlights (pair)', category: 'Lighting',
    description: 'LED matrix units with animated daytime running lights.',
    meshMatch: ['Ext_Lights_Glass', 'Ext_Lights_Glow', 'Ext_Lights_Chrome', 'Ext_Lights_Black'], pictureContext: 'car', leadTimeDays: 25,
    pricing: supplied(38900, 1400),
    appearance: [{ match: 'Glow', emissive: '#e0f2fe', emissiveIntensity: 3 }, { match: 'Black', color: '#050505' }] },
  { id: 'golf85r-taillights-led', name: 'Smoked LED tail light clusters (pair)', category: 'Lighting',
    description: 'Full LED rear clusters with smoked lenses and dynamic indicators.',
    meshMatch: ['Taillight', 'Trunk_Lid_Light'], pictureContext: 'car', leadTimeDays: 15, pricing: supplied(12800, 800),
    appearance: [{ match: 'Glow', emissive: '#ff1a1a', emissiveIntensity: 3 }, { match: 'Glass_Red', color: '#2a0505' }] },
  { id: 'golf85r-seats-r-nappa', name: 'R performance seats — Cognac Nappa (front & rear)', category: 'Interior',
    description: 'Retrim of the R seats in Cognac Nappa leather with contrast stitching.',
    meshMatch: ['Int_Seats'], view: 'interior', leadTimeDays: 30, pricing: supplied(24500, 1100, 20),
    appearance: [{ match: 'Textile', color: '#8b4a2b', roughness: 0.55 }] },
  { id: 'golf85r-wheel-r-alcantara', name: 'R steering wheel — Alcantara (designer)', category: 'Interior',
    description: 'Designer Alcantara rim with blue 12 o\'clock marker, built to order.',
    meshMatch: ['Int_SW'], view: 'interior', leadTimeDays: 21, pricing: designer(4200, 350, 1200),
    appearance: [{ match: 'Leather', color: '#2f3033', roughness: 1 }, { match: 'Blue_R_Accent', color: '#2563eb', emissive: '#1d4ed8', emissiveIntensity: 0.6 }] }
].map(part => ({ view: 'exterior', ...part, fitment: fitGolf, currency: 'BWP', performance: null, status: 'published', mock: true }));
