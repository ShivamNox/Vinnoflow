// auth/auth.js
export default function authMiddleware(req, res, next) {
  if (req.session?.auth) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
