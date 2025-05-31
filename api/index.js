export default function handler(req, res) {
  res.status(200).json({
    message: "Hello from BW Car Culture API!",
    timestamp: new Date().toISOString(),
    working: true
  });
}
