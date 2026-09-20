import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET!,
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  maxFileSize: Number(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024,
  nodeEnv: process.env.NODE_ENV || 'development',

  // CloudBase 环境 + 腾讯云 CAM 密钥（rdb 网关与 COS 共用）
  cloudbaseEnv: process.env.CLOUDBASE_ENV_ID || '',
  cos: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || 'ap-shanghai',
  },

  // 微信开放平台（网站应用扫码登录），未配置时前端隐藏入口
  wechat: {
    appid: process.env.WECHAT_APPID || '',
    secret: process.env.WECHAT_SECRET || '',
    redirect: process.env.WECHAT_REDIRECT || '',
  },
}

// 研究等级定义
export const LEVELS = [
  { level: 1, name: '初识研究', min: 0 },
  { level: 2, name: '文献探索者', min: 50 },
  { level: 3, name: '研究实践者', min: 150 },
  { level: 4, name: '深度研究者', min: 300 },
  { level: 5, name: '研忆学者', min: 600 },
]

export function calcLevel(points: number) {
  let level = 1
  let nextMin = 50
  for (const l of LEVELS) {
    if (points >= l.min) {
      level = l.level
      nextMin = LEVELS.find((x) => x.level === l.level + 1)?.min ?? l.min
    }
  }
  return { level, current: LEVELS.find((l) => l.level === level)!, nextMin }
}
