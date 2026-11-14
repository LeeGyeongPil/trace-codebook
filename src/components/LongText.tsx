// 긴 글은 접어 두고 "더 보기"로 펼친다(트레이스 한 건에 수천 자짜리 문서가 들어 있는 일이 흔하다).
import { useState } from 'react';
import { useLang } from '../i18n';

const LIMIT = 800;

export function LongText({ text, pre = false }: { text: string; pre?: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const long = text.length > LIMIT;
  const shown = long && !open ? text.slice(0, LIMIT) + '…' : text;
  const Tag = pre ? 'pre' : 'div';
  return (
    <>
      <Tag className="long-text">{shown || <em className="muted">{t('msg.empty')}</em>}</Tag>
      {long && (
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? t('msg.showLess') : t('msg.showMore')}
        </button>
      )}
    </>
  );
}
