// 오른쪽 위 언어 선택 메뉴. 고른 값은 localStorage 에 저장되어 다음에 열 때도 유지된다.
import { useLang, type Lang } from '../i18n';

export function LangMenu() {
  const { lang, setLang, t } = useLang();
  return (
    <label className="lang-menu">
      <span className="lang-menu__label">{t('lang.label')}</span>
      <select aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {/* 언어 이름은 각 언어 그대로 적는다 — 어느 화면에서도 자기 언어를 찾을 수 있게 */}
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
}
