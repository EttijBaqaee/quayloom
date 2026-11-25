/** Build-time public mount point; must match BASE_PATH on the backend. */
export const appPath = (path = '/') => `${__BASE_PATH__}${path}`
