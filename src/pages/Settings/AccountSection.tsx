import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField } from '../../components/common/TextField.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useSession } from '../../state/useSession.ts'
import { Group, Section } from './bits.tsx'

export function AccountSection() {
  const confirm = useConfirm()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, updateProfile, changePassword, signOut, deleteAccount } = useSession()
  const [name, setName] = useState(user?.name ?? '')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null)
  const [profileMessage, setProfileMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  if (!user) return null

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    const message = await updateProfile({ name, nickname, email, avatar })
    setProfileMessage(message ?? t('settings.account.profileSaved'))
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    const message = await changePassword(currentPassword, nextPassword, confirmPassword)
    setPasswordMessage(message ?? t('settings.account.passwordChanged'))
    if (!message) {
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <Section>
      <Group title={t('settings.account.profile')} description={t('settings.account.profileHint')}>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="profile-avatar flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs text-neutral-400">
              {avatar ? <img src={avatar} alt="" className="block size-full object-cover" /> : t('settings.account.photo')}
            </div>
            <label className="profile-image-picker min-w-0 flex-1 text-sm text-neutral-500">
              <span className="btn btn-line">{t('settings.account.profileImage')}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > 350_000) {
                    setProfileMessage(t('settings.account.imageTooLarge'))
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => setAvatar(String(reader.result))
                  reader.readAsDataURL(file)
                }}
              />
            </label>
          </div>
          <TextField label={t('settings.account.name')} value={name} onChange={setName} />
          <TextField label={t('settings.account.nickname')} value={nickname} onChange={setNickname} />
          <TextField label={t('settings.account.email')} type="email" value={email} onChange={setEmail} />
          {profileMessage ? <p className="text-sm text-neutral-500">{profileMessage}</p> : null}
          <button type="submit" className="btn btn-primary">{t('settings.account.saveProfile')}</button>
        </form>
      </Group>
      <Group title={t('settings.account.security')} description={t('settings.account.securityHint')}>
        <form onSubmit={savePassword} className="space-y-4">
          <TextField label={t('settings.account.currentPassword')} type="password" value={currentPassword} onChange={setCurrentPassword} />
          <TextField label={t('settings.account.newPassword')} type="password" value={nextPassword} onChange={setNextPassword} />
          <TextField label={t('settings.account.confirmPassword')} type="password" value={confirmPassword} onChange={setConfirmPassword} />
          {passwordMessage ? <p className="text-sm text-neutral-500">{passwordMessage}</p> : null}
          <button type="submit" className="btn btn-primary">{t('settings.account.changePassword')}</button>
        </form>
      </Group>
      <Group title={t('settings.account.management')} description={t('settings.account.managementHint')}>
        <div className="flex flex-wrap gap-4 text-sm">
          <button type="button" className="btn btn-ghost" onClick={async () => { try { await signOut(); navigate(ROUTES.login) } catch { setProfileMessage(t('settings.account.signOutFailed')) } }}>{t('settings.account.signOut')}</button>
          <button
            type="button"
            className="text-neutral-400"
            onClick={async () => {
              if (!await confirm(t('settings.account.deleteAccountConfirm'))) return
              const message = await deleteAccount()
              if (message) { setProfileMessage(message); return }
              navigate(ROUTES.login)
            }}
          >
            {t('settings.account.deleteAccount')}
          </button>
        </div>
      </Group>
    </Section>
  )
}
