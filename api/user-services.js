
// api/user-services.js
// Ultra-simple version that cannot crash

export default function handler(req, res) {
  res.status(200).json({ message: "working" });
}