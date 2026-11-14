/** 문자열을 파일로 내려받게 한다(Blob URL → <a download>). 네트워크로는 아무것도 보내지 않는다. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // 내려받기가 시작된 뒤 메모리를 돌려준다
}
