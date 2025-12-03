function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

function randomSuffix(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Формат: FP_YYYY-MM-DD_HH-MM-SS_xxxxxx
 */
export function generateChatName(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const suffix = randomSuffix(6);
  return `FP_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}_${suffix}`;
}

/**
 * Формат messageId:
 *  - пользователь: <chatName>__u_XXX
 *  - бот:         <chatName>__b_XXX
 */
export function generateMessageId(chatName: string, role: "u" | "b", sequence: number): string {
  return `${chatName}__${role}_${pad3(sequence)}`;
}
