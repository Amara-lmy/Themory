/**
 * COS 云存储封装（cos-nodejs-sdk-v5）
 * - key 格式：papers/{userId}/{nanoid}.{ext}
 * - 上传/下载/删除均为 Buffer 操作（文件上限 20MB，可接受）
 */
import COS from 'cos-nodejs-sdk-v5'
import { config } from '../config.js'

const cos = new COS({
  SecretId: config.cos.secretId,
  SecretKey: config.cos.secretKey,
})

const BUCKET = config.cos.bucket
const REGION = config.cos.region

/** 文件类型注册表：新增格式只需在这里加一项 */
export interface FileTypeMeta {
  mime: string
  label: string
  /** AI 问答时是否提取全文 */
  extractable: boolean
}

export const FILE_TYPES: Record<string, FileTypeMeta> = {
  pdf: { mime: 'application/pdf', label: 'PDF 文档', extractable: true },
  doc: { mime: 'application/msword', label: 'Word 文档', extractable: true },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word 文档',
    extractable: true,
  },
  // 预留：后续直接在注册表里开启即可
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PPT 演示文稿',
    extractable: false,
  },
  txt: { mime: 'text/plain', label: '文本文件', extractable: true },
}

export function isSupportedExt(ext: string): boolean {
  return Boolean(FILE_TYPES[ext])
}

export function fileKeyFor(userId: string, ext: string): string {
  const nano = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return `papers/${userId}/${nano}.${ext}`
}

export async function putFile(key: string, buffer: Buffer): Promise<void> {
  await cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: buffer })
}

export async function getFile(key: string): Promise<Buffer> {
  const r = await cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key })
  return r.Body as Buffer
}

export async function deleteFile(key: string): Promise<void> {
  await cos.deleteObject({ Bucket: BUCKET, Region: REGION, Key: key })
}
