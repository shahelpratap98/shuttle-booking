// How long a trip ties the driver up, including the drive back, worked out
// from where it goes. Used for the calendar and clash warnings; nobody enters it.
export function guessDuration(a: string): number {
  const s = a.toLowerCase();
  if (/whole day|full day|day tour|tour|vessel|cruise/.test(s)) return 720;
  if (/rotorua|tauranga|taupo|mount maunganui|whakatane|okere|papamoa|hobbiton|waitomo/.test(s)) return 420;
  if (/waihi|thames|coromandel|hahei|whitianga|matamata|paeroa|tirau|putaruru|tokoroa/.test(s)) return 360;
  if (/cambridge|te awamutu|huntly|gordonton|ngaruawahia|raglan|morrinsville|hamilton|pukete|fitzroy|tamahere/.test(s)) return 240;
  return 150;
}
