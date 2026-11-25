import type { ReactNode } from 'react'
import { StudioToolbar } from '../../app/StudioApp.js'
import { IconMenuOutline20, IconNewChatOutline20 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider, useMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端单行聊天导航：抽屉、标题、视图切换与新对话。 */
export const MobileHeader = ({ title, children }: { title?: string; children?: ReactNode }) => {
  const t = useTranslate()
  const drawerOpen = useMobileSider(state => state.open)
  return (
    <><div className={styles.header} data-ql-mobile-header>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        aria-haspopup="dialog"
        aria-controls="mobile-session-drawer"
        aria-expanded={drawerOpen}
        onClick={openMobileSider}
      />
      <div className={styles.title} title={title}>{title ?? 'Quayloom'}</div>
      {title === undefined ? null : (
        <IconButton
          size="xl"
          tone="primary"
          icon={<IconNewChatOutline20 />}
          aria-label={t('newChat')}
          onClick={newChat}
        />
      )}
      <StudioToolbar mobile />
    </div>{children && <div className={styles.views}>{children}</div>}</>
  )
}
