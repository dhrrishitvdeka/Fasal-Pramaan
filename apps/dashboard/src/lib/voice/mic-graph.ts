type GainLike = { gain: { value: number }; connect: (node: never) => unknown };
type CtxLike = { createGain: () => GainLike; destination: unknown };
// DOM AudioNode.connect is overloaded. Parameter `never` keeps ScriptProcessorNode
// assignable (contravariance) without using `any`.
type NodeLike = { connect: (node: never) => unknown };

/** Keep ScriptProcessor running without playing the live microphone. */
export function connectSilentProcessor(processor: NodeLike, ctx: CtxLike): GainLike {
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.connect(mute as never);
  mute.connect(ctx.destination as never);
  return mute;
}
