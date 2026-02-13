import axios from 'axios';

export function getHostApi() {
  const hostIp = localStorage.getItem('host_ip');
  if (!hostIp) throw new Error('Host not configured');

  return axios.create({
    baseURL: `http://${hostIp}:5050`,
    timeout: 5000
  });
}
