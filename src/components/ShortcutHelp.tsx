// 단축키 도움말. 표는 core/annotations 의 SHORTCUTS 한 곳에서 온다.
import { SHORTCUTS } from '../core/annotations';
import { useLang } from '../i18n';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('shortcut.title')}>
      <div className="modal__box">
        <h3>{t('shortcut.title')}</h3>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{t(s.msgId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn" onClick={onClose}>
          {t('shortcut.close')}
        </button>
      </div>
    </div>
  );
}
