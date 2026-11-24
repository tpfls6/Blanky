import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, KeyRound, LogOut, Trash2, UserRound } from 'lucide-react'
import { TextField } from '../../components/common/TextField.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { SETTINGS_COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useSession } from '../../state/useSession.ts'
import { Group, Section } from './bits.tsx'
import { MCard, MHint, MLabel, MRow, MSheet } from './mobileRows.tsx'

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
  const compact = useMediaQuery(SETTINGS_COMPACT_QUERY)
  const [sheet, setSheet] = useState<'name' | 'nickname' | 'password' | null>(null)
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    const message = await updateProfile({ name, nickname, email, avatar })
    setProfileMessage(message ?? t('settings.account.profileSaved'))
  }

  const savePassword = async (event?: FormEvent) => {
    event?.preventDefault()
    const message = await changePassword(currentPassword, nextPassword, confirmPassword)
    setPasswordMessage(message ?? t('settings.account.passwordChanged'))
    if (!message) {
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
    }
    return !message
  }

  // The 350KB check and FileReader read are shared; phones save the new photo right away.
  const pickAvatar = (file: File | undefined, apply: (avatar: string) => void) => {
    if (!file) return
    if (file.size > 350_000) {
      setProfileMessage(t('settings.account.imageTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => apply(String(reader.result))
    reader.readAsDataURL(file)
  }

  const signOutNow = async () => { try { await signOut(); navigate(ROUTES.login) } catch { setProfileMessage(t('settings.account.signOutFailed')) } }
  const deleteNow = async () => {
    if (!await confirm(t('settings.account.deleteAccountConfirm'))) return
    const message = await deleteAccount()
    if (message) { setProfileMessage(message); return }
    navigate(ROUTES.login)
  }

  // Below lg: large avatar with a camera button, value rows that open edit sheets, account actions at the bottom.
  if (compact) {
    const saveCompact = async (next: { avatar?: string | null }, close = true) => {
      setBusy(true)
      const message = await updateProfile({ name, nickname, email, avatar, ...next })
      setBusy(false)
      if (message) { setProfileMessage(message); return }
      setProfileMessage(next.avatar !== undefined ? t('settings.mobile.photoSaved') : t('settings.account.profileSaved'))
      if (close) setSheet(null)
    }
    const closeSheet = () => {
      setName(user.name ?? '')
      setNickname(user.nickname ?? '')
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
      setPasswordMessage('')
      setSheet(null)
    }
    const initial = (user.nickname || user.name || user.email || '').trim().charAt(0).toUpperCase()
    const openProfile = (field: 'name' | 'nickname') => { setProfileMessage(''); setSheet(field) }
    return (
      <div>
        <div className="more-account-head">
          <span className="more-avatar more-avatar-lg profile-avatar">
            {avatar ? <img src={avatar} alt="" /> : initial || <UserRound size={34} strokeWidth={1.5} aria-hidden="true" />}
            <label className="more-avatar-cam">
              <Camera size={16} strokeWidth={1.6} aria-hidden="true" />
              <span className="sr-only">{t('settings.mobile.changePhoto')}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => pickAvatar(event.target.files?.[0], (next) => { setAvatar(next); void saveCompact({ avatar: next }, false) })} />
            </label>
          </span>
          <span className="more-hint">{t('settings.mobile.photoLimit')}</span>
          {profileMessage && !sheet ? <p className="more-hint" role="status">{profileMessage}</p> : null}
        </div>
        <MLabel>{t('settings.account.profile')}</MLabel>
        <MCard>
          <MRow label={t('settings.account.name')} value={user.name || t('settings.mobile.empty')} onPress={() => openProfile('name')} data-settings-row="name" />
          <MRow label={t('settings.account.nickname')} value={user.nickname || t('settings.mobile.empty')} onPress={() => openProfile('nickname')} data-settings-row="nickname" />
          <MRow label={t('settings.account.email')} value={user.email} />
        </MCard>
        <MLabel>{t('settings.account.security')}</MLabel>
        <MCard>
          <MRow icon={<KeyRound size={18} strokeWidth={1.6} aria-hidden="true" />} label={t('settings.account.changePassword')} onPress={() => setSheet('password')} data-settings-row="password" />
        </MCard>
        {passwordMessage && !sheet ? <p className="more-hint" role="status">{passwordMessage}</p> : null}
        <MLabel>{t('settings.account.management')}</MLabel>
        <MCard>
          <MRow icon={<LogOut size={18} strokeWidth={1.6} aria-hidden="true" />} label={t('settings.account.signOut')} onPress={() => void signOutNow()} chevron={false} data-settings-row="sign-out" />
          <MRow icon={<Trash2 size={18} strokeWidth={1.6} aria-hidden="true" />} label={t('settings.account.deleteAccount')} danger onPress={() => void deleteNow()} data-settings-row="delete-account" />
        </MCard>
        <MHint>{t('settings.mobile.deleteWarning')}</MHint>
        {sheet === 'name' || sheet === 'nickname' ? (
          <MSheet title={t(sheet === 'name' ? 'settings.mobile.editName' : 'settings.mobile.editNickname')} onClose={closeSheet} busy={busy} onSave={() => void saveCompact({})}>
            {sheet === 'name'
              ? <TextField label={t('settings.account.name')} value={name} onChange={setName} />
              : <TextField label={t('settings.account.nickname')} value={nickname} onChange={setNickname} />}
            {profileMessage ? <p className="mt-3 text-sm text-neutral-500" role="status">{profileMessage}</p> : null}
          </MSheet>
        ) : null}
        {sheet === 'password' ? (
          <MSheet title={t('settings.account.changePassword')} onClose={closeSheet} busy={busy} saveLabel={t('settings.account.changePassword')}
            onSave={() => { setBusy(true); void savePassword().then((done) => { setBusy(false); if (done) setSheet(null) }) }}>
            <div className="space-y-4">
              <TextField label={t('settings.account.currentPassword')} type="password" value={currentPassword} onChange={setCurrentPassword} />
              <TextField label={t('settings.account.newPassword')} type="password" value={nextPassword} onChange={setNextPassword} />
              <TextField label={t('settings.account.confirmPassword')} type="password" value={confirmPassword} onChange={setConfirmPassword} />
            </div>
            {passwordMessage ? <p className="mt-3 text-sm text-neutral-500" role="status">{passwordMessage}</p> : null}
          </MSheet>
        ) : null}
      </div>
    )
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
                onChange={(event) => pickAvatar(event.target.files?.[0], setAvatar)}
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
          <button type="button" className="btn btn-ghost" onClick={() => void signOutNow()}>{t('settings.account.signOut')}</button>
          <button
            type="button"
            className="text-neutral-400"
            onClick={() => void deleteNow()}
          >
            {t('settings.account.deleteAccount')}
          </button>
        </div>
      </Group>
    </Section>
  )
}
