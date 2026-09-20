import { Check, Languages, BookmarkCheck, Quote } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useSettings } from '../../store/SettingsContext'
import { CITATION_STYLES, CITATION_SAMPLE, formatCitation, type CitationStyle } from '../../lib/citation'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

/** 偏好设置悬浮窗：引文格式 / 划词翻译 / 阅读位置记忆 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { settings, updateSetting } = useSettings()

  return (
    <Modal
      open={open}
      title="偏好设置"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      }
    >
      {/* 引文格式 */}
      <div className="settings-section">
        <div className="settings-section-title">
          <Quote size={14} />
          默认引文格式
        </div>
        <div className="settings-hint">导入文献时按此格式自动填充引文，之后仍可双击引文栏自行修改。</div>
        <div className="style-options">
          {CITATION_STYLES.map((s) => (
            <button
              key={s.id}
              className={`style-option ${settings.citationStyle === s.id ? 'active' : ''}`}
              onClick={() => updateSetting('citationStyle', s.id as CitationStyle)}
            >
              <span className="style-radio">{settings.citationStyle === s.id && <Check size={11} />}</span>
              <span className="style-text">
                <span className="style-label">{s.label}</span>
                <span className="style-desc">{s.desc}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="style-preview">
          <div className="style-preview-label">预览</div>
          <div className="style-preview-text">
            {formatCitation(CITATION_SAMPLE, settings.citationStyle)}
          </div>
        </div>
      </div>

      {/* 阅读与翻译 */}
      <div className="settings-section">
        <div className="settings-section-title">阅读与翻译</div>
        <SwitchRow
          icon={<Languages size={15} />}
          title="划词翻译"
          desc="在论文中框选英文文本时，浮出中文翻译卡片。"
          checked={settings.translateEnabled}
          onChange={(v) => updateSetting('translateEnabled', v)}
        />
        <SwitchRow
          icon={<BookmarkCheck size={15} />}
          title="阅读位置记忆"
          desc="再次打开论文时，自动回到上次读到的页码。"
          checked={settings.rememberPosition}
          onChange={(v) => updateSetting('rememberPosition', v)}
        />
      </div>
    </Modal>
  )
}

function SwitchRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="setting-switch-row">
      <span className="setting-switch-icon">{icon}</span>
      <div className="setting-switch-text">
        <div className="setting-switch-title">{title}</div>
        <div className="setting-switch-desc">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}
