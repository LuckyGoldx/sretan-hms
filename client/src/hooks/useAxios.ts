import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

apiClient.interceptors.request.use((config) => {
  config.headers['x-master-token'] = 'sretan-emr-master-token-2026'
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response
      if (status === 401) {
        console.error('Unauthorized – redirecting to login')
      } else if (status === 403) {
        console.error('Forbidden – insufficient permissions')
      } else if (status === 500) {
        console.error('Internal server error')
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
