import type { CustomRecordType } from '../../features/records/schema.ts'
import { LIMITS, encoder, fromBase64, packageError } from '../../theme/package/limits.ts'
import { readZip, writeZip } from '../../theme/package/zip.ts'
import {
  TEMPLATE_PACKAGE_EXTENSION,
  TEMPLATE_PACKAGE_KIND,
  type TemplatePackage,
} from './schema.ts'
import {
  decodeJson,
  packagesFromUnknown,
  snapshotFromRecordType,
  validateManifest,
  validatePackage,
  validateTemplateAsset,
} from './TemplateValidator.ts'

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 80 && bytes[1] === 75
}

export async function importTemplatePackage(file: Blob): Promise<TemplatePackage> {
  const packages = await importTemplatePackages(file)
  const first = packages[0]
  if (!first) packageError('템플릿이 비어 있습니다.')
  return first
}

export async function importTemplatePackages(file: Blob): Promise<TemplatePackage[]> {
  if (file.size > LIMITS.package) packageError('전체 템플릿 패키지는 최대 20MB입니다.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isZip(bytes)) {
    if (file.size > LIMITS.json) packageError('JSON 파일이 너무 큽니다.')
    return packagesFromUnknown(decodeJson(bytes))
  }
  const files = await readZip(bytes)
  if (!files['manifest.json']) packageError('manifest.json이 필요합니다.')
  const json = (path: string) => {
    const raw = files[path]
    if (!raw) packageError('필수 JSON 파일이 없습니다: ' + path)
    return decodeJson(raw)
  }
  const manifest = validateManifest(json('manifest.json'))
  const templatePath = files[manifest.entry.template] ? manifest.entry.template : files['template.json'] ? 'template.json' : ''
  const snapshotSource = templatePath ? json(templatePath) : undefined
  const assets: TemplatePackage['files'] = {}
  for (const [path, raw] of Object.entries(files)) {
    if (path === 'manifest.json' || path === manifest.entry.template || path === 'template.json') continue
    if (!path.startsWith('assets/') && !path.startsWith('preview/')) packageError('허용되지 않은 패키지 파일입니다: ' + path)
    assets[path] = validateTemplateAsset(path, raw)
  }
  return [validatePackage({
    ...manifest,
    manifest,
    snapshot: snapshotSource,
    files: assets,
  })]
}

export function packageFromRecordType(type: CustomRecordType, author = ''): TemplatePackage {
  return validatePackage({
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(type.id) ? type.id : 'template',
    name: type.name,
    description: type.description,
    author,
    version: '1.0.0',
    pageType: 'record',
    icon: type.icon,
    snapshot: snapshotFromRecordType(type),
  })
}

export async function exportTemplatePackage(pkg: TemplatePackage): Promise<Blob> {
  const safe = validatePackage(pkg)
  if (!Object.keys(safe.files).length) {
    return new Blob([encoder.encode(JSON.stringify({
      formatVersion: safe.manifest.formatVersion,
      kind: safe.manifest.kind,
      id: safe.manifest.id,
      name: safe.manifest.name,
      description: safe.manifest.description,
      author: safe.manifest.author,
      version: safe.manifest.version,
      pageType: safe.manifest.pageType,
      icon: safe.manifest.icon,
      ...(safe.manifest.preview ? { preview: safe.manifest.preview } : {}),
      ...(safe.manifest.fieldLabels ? { fieldLabels: safe.manifest.fieldLabels } : {}),
      snapshot: safe.snapshot,
    }, null, 2))], { type: 'application/json' })
  }
  const files: Record<string, Uint8Array> = {
    'manifest.json': encoder.encode(JSON.stringify(safe.manifest, null, 2)),
    [safe.manifest.entry.template]: encoder.encode(JSON.stringify(safe.snapshot, null, 2)),
  }
  for (const [path, file] of Object.entries(safe.files)) files[path] = fromBase64(file.data)
  return new Blob([writeZip(files) as BlobPart], { type: 'application/octet-stream' })
}

export function downloadTemplate(blob: Blob, name: string, extension = TEMPLATE_PACKAGE_EXTENSION) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.replace(/[^a-zA-Z0-9가-힣_-]/g, '-') + extension
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
