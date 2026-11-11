// 3D Config Simulator API — kept out of api/index.js, which only forwards requests here.
// Every route checks the user on the server; hiding the cube in the UI is not the access control.
import { CONFIGURATOR_MOCK_PARTS } from './configuratorMockParts.js';

// Single switch for opening the simulator to all signed-in users later.
export const canUseConfigurator = user => user?.role === 'admin';

// Customer price = (manufacturing/supply + delivery + designer fee) × (1 + platform margin).
export const partPrice = ({ cost = 0, delivery = 0, designerFee = 0, marginPct = 0 } = {}) =>
  Math.round((cost + delivery + designerFee) * (1 + marginPct / 100));

// Strip internal cost/margin terms before anything reaches the browser.
export const publicPart = ({ pricing, ...part }) => ({
  ...part,
  source: pricing?.source || 'supplier',
  price: partPrice(pricing)
});

export const partsForVehicleModel = (vehicleModelId, parts = CONFIGURATOR_MOCK_PARTS) =>
  parts.filter(p => p.status === 'published' && p.fitment?.vehicleModelIds?.includes(vehicleModelId)).map(publicPart);

export const handleConfiguratorRoute = async ({ path, req, res, searchParams, verifyUserToken }) => {
  const route = path.replace(/^\/api(?=\/configurator\/)/, '');
  if (!route.startsWith('/configurator/')) return false;

  const auth = await verifyUserToken(req);
  if (!auth.success) { res.status(401).json({ success: false, message: 'Authentication required' }); return true; }
  if (!canUseConfigurator(auth.user)) { res.status(403).json({ success: false, message: 'The Config Simulator is not available yet' }); return true; }

  if (route === '/configurator/parts' && req.method === 'GET') {
    const vehicleModel = searchParams.get('vehicleModel');
    if (!vehicleModel || !/^[a-z0-9-]{3,60}$/.test(vehicleModel)) {
      res.status(400).json({ success: false, message: 'vehicleModel is required' });
      return true;
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).json({ success: true, mock: true, vehicleModel, data: partsForVehicleModel(vehicleModel) });
    return true;
  }

  res.status(404).json({ success: false, message: 'Configurator route not found' });
  return true;
};
