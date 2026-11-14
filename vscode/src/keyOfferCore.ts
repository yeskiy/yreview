export const KEY_OFFER_TEXT =
  'Use Ctrl+Shift+G, the IntelliJ key, for Add Review Comment? It replaces Show Source Control while an editor has focus.'

export interface OfferHost {
  answer(): string | undefined
  saveAnswer(value: 'yes' | 'no'): Promise<void>
  ask(message: string, ...items: string[]): Promise<string | undefined>
  enableKey(): Promise<void>
}

/** Asks once. Both answers stay, so the offer never shows again. */
export const runKeyOffer = async (host: OfferHost): Promise<void> => {
  if (host.answer() !== undefined) return
  const choice = await host.ask(KEY_OFFER_TEXT, 'Yes', 'No')
  if (choice === 'Yes') {
    await host.enableKey()
    await host.saveAnswer('yes')
  }
  if (choice === 'No') await host.saveAnswer('no')
}
