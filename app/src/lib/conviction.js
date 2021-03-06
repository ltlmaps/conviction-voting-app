/**
 * Calculate the amount of conviction at certain time from an initial conviction
 * and the amount of staked tokens following the formula:
 * `y0 * a ^ t + (x * (1 - a ^ t)) / (1 - a)`.
 * @param {number} timePassed Number of blocks since time 0
 * @param {number} initConv Amount of conviction at time 0
 * @param {number} amount Staked tokens at time 0
 * @param {number} alpha Constant that controls the conviction decay
 * @return {number} Amount of conviction at time t
 */
export function calculateConviction(timePassed, initConv, amount, alpha) {
  const t = timePassed
  const y0 = initConv
  const x = amount
  const a = alpha
  const y = y0 * a ** t + (x * (1 - a ** t)) / (1 - a)
  return y
}

/**
 * Get current conviction on a proposal
 * @param {{time: number, tokensStaked: number, totalTokensStaked: number, conviction: number}[]} stakes
 * List of token stakes made on a proposal
 * @param {number} currentTime Current block
 * @param {string} alpha Constant that controls the conviction decay
 * @return {number} Current conviction
 */
export function getCurrentConviction(stakes, currentTime, alpha) {
  const lastStake = [...stakes].pop()
  if (lastStake) {
    const { time, totalTokensStaked, conviction } = lastStake
    // Calculate from last stake to now
    return calculateConviction(
      currentTime - time,
      conviction,
      totalTokensStaked,
      alpha
    )
  } else {
    return 0
  }
}

// TODO: Move the following code to tests
export function checkConvictionImplementation(stakes, alpha) {
  const { conviction } = convictionFromStakes(stakes, alpha)
  if (stakes.length > 0) {
    const solidityConviction = [...stakes].pop().conviction
    if (solidityConviction !== conviction) {
      console.error(
        'Mismatch between solidity and js code on conviction calculation.',
        solidityConviction,
        conviction
      )
    }
  }
}

/**
 * Get current conviction of an entity on a proposal
 * @param {{time: number, tokensStaked: number, totalTokensStaked: number, conviction: number}[]} stakes
 * List of token stakes made on a proposal
 * @param {string} entity Entity by which we will filter the stakes
 * @param {number} currentTime Current block
 * @param {string} alpha Constant that controls the conviction decay
 * @return {number} Current conviction
 */
export function getCurrentConvictionByEntity(
  stakes,
  entity,
  currentTime,
  alpha
) {
  const entityStakes = stakesByEntity(stakes, entity)
  if (entityStakes.length > 0) {
    const { time, totalTokensStaked, conviction } = convictionFromStakes(
      entityStakes,
      alpha
    )
    // Calculate from last stake to now
    return calculateConviction(
      currentTime - time,
      conviction,
      totalTokensStaked,
      alpha
    )
  } else {
    return 0
  }
}

/**
 * Get total conviction amounts for the last 50 blocks for a certain proposal.
 * @param {{time: number, tokensStaked: number, totalTokensStaked: number, conviction: number}[]} stakes
 * List of token stakes made on a proposal
 * @param {number} currentTime Current block number
 * @param {string} alpha Constant that controls the conviction decay
 * @param {number} timeUnit Number of blocks a time unit has
 * @returns {number[]} Array with conviction amounts from time t-50 to time t
 */
export function getConvictionHistory(stakes, currentTime, alpha, timeUnit) {
  const history = []
  let initTime = currentTime - 50 * timeUnit - 1

  // Fill the first spots with 0s if currentTime < 50
  while (initTime < 0) {
    if (initTime % timeUnit === 0) {
      history.push(0)
    }
    initTime++
  }

  const oldStakes = [...stakes].filter(stake => stake.time <= initTime)
  const recentStakes = [...stakes].filter(stake => stake.time > initTime)

  let { totalTokensStaked: oldAmount, conviction: lastConv, time: lastTime } = [
    ...oldStakes,
  ].pop() || { totalTokensStaked: 0, conviction: 0, time: 0 }
  lastConv = calculateConviction(
    initTime - lastTime,
    lastConv,
    oldAmount,
    alpha
  )
  let timePassed = 0 // age of current conviction amount, reset every time conviction stake is changed.
  let i = 0

  for (let t = initTime; t <= currentTime; t++) {
    if (t % timeUnit === 0) {
      history.push(calculateConviction(timePassed, lastConv, oldAmount, alpha))
    }
    // check if new stakes are made at this time
    while (recentStakes.length > i && recentStakes[i].time <= t) {
      oldAmount = recentStakes[i++].totalTokensStaked
      timePassed = 0
      lastConv = [...history].pop()
    }
    timePassed++
  }
  return history
}

/**
 * Get entity's conviction amounts for the last 50 blocks for a certain proposal.
 * @param {{time: number, tokensStaked: number, totalTokensStaked: number, conviction: number}[]} stakes
 * List of token stakes made on a proposal
 * @param {string} entity Entity by which we will filter the stakes
 * @param {number} time Current block number
 * @param {string} alpha Constant that controls the conviction decay
 * @param {number} timeUnit Number of blocks a time unit has
 * @returns {number[]} Array with conviction amounts from time 0 to `time`
 */
export function getConvictionHistoryByEntity(
  stakes,
  entity,
  time,
  alpha,
  timeUnit
) {
  return getConvictionHistory(
    stakesByEntity(stakes, entity),
    time,
    alpha,
    timeUnit
  )
}

/**
 * Get number of blocks needed in order for a proposal to pass.
 * @param {number} threshold Amount of conviction needed for a proposal to pass
 * @param {number} conviction Current amount of conviction
 * @param {number} amount Current amount of staked tokens
 * @param {number} alpha Constant that controls the conviction decay
 * @returns {number|NaN} Number of blocks needed. It is negative if `conviction
 * > threshold` and `NaN` if conviction will not pass the threshold with the
 * current amount of staked tokens
 */
export function getRemainingTimeToPass(threshold, conviction, amount, alpha) {
  const a = alpha
  const y = threshold
  const y0 = conviction
  const x = amount
  return Math.log(((a - 1) * y + x) / ((a - 1) * y0 + x)) / Math.log(a)
}

/**
 * Gets conviction trend in percentage for the next `timeUnit` amount of blocks.
 * @param {{time: number, tokensStaked: number, totalTokensStaked: number, conviction: number}[]} stakes
 * List of token stakes made on a proposal
 * @param {number} maxConviction Max conviction possible with current token supply
 * @param {number} time Current block number
 * @param {number} alpha Constant that controls the conviction decay
 * @param {number} timeUnit Number of blocks a time unit has
 * @returns {number} Number from -1 to 1 that represents the increment or
 * decrement of conviction
 */
export function getConvictionTrend(
  stakes,
  maxConviction,
  time,
  alpha,
  timeUnit = 5
) {
  const currentConviction = getCurrentConviction(stakes, time, alpha)
  const futureConviction = getCurrentConviction(stakes, time + timeUnit, alpha)
  return (futureConviction - currentConviction) / maxConviction
}

/**
 * Calculate amount of conviction needed for a proposal to pass. It uses the
 * formula: `threshold = (rho * supply) / (1 - alpha) / (beta - (requeted / funds)) ** 2`.
 * @param {number} requested Amount of requested funds
 * @param {number} funds Total amount of funds
 * @param {number} supply Supply of the token being staked
 * @param {number} alpha Constant that controls the decay
 * @param {number} beta Maximum share of funds a proposal can take
 * @param {number} rho Tuning param to set up the threshold (linearly)
 * @returns {number} Threshold
 */
export function calculateThreshold(requested, funds, supply, alpha, beta, rho) {
  const share = requested / funds
  if (share < beta) {
    return (rho * supply) / (1 - alpha) / (beta - share) ** 2
  } else {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * Get the needed stake in order for conviction to arrive a certain threshold
 * at some point in time. We obtain this function isolating `x` from the max
 * conviction formula `y = x / (1 - a), so we know how much tokens are needed
 * to be staked (`x`) in order for conviction to arribe a certain threshold `y`.
 * @param {number} threshold Amount of conviction needed for a proposal to pass
 * @param {number} alpha Constant that controls the decay
 * @returns {number} Minimum amount of needed staked tokens for a proposal to
 * pass
 */
export function getMinNeededStake(threshold, alpha) {
  const y = threshold
  const a = alpha
  return -a * y + y
}

/**
 * Get max conviction possible with current staked tokens. It can also be used
 * to state the 100% of conviction in visuals if the token supply amount is
 * passed. We obtain this function from the conviction formula, by calculating
 * the limit when time `t` is infinite.
 * @param {number} amount Staked tokens
 * @param {number} alpha Constant that controls the decay
 * @returns {number} Max amount of conviction possible
 */
export function getMaxConviction(amount, alpha) {
  const x = amount
  const a = alpha
  return x / (1 - a)
}

function convictionFromStakes(stakes, alpha) {
  const [conviction, time, totalTokensStaked] = stakes.reduce(
    ([lastConv, lastTime, oldAmount], stake) => {
      const amount = stake.totalTokensStaked
      const timePassed = stake.time - lastTime
      lastConv = calculateConviction(timePassed, lastConv, oldAmount, alpha)
      lastTime = stake.time
      return [lastConv, lastTime, amount]
    },
    [0, 0, 0] // Initial conviction, time, and amount to 0
  )
  return { conviction, time, totalTokensStaked }
}

function stakesByEntity(stakes, entity) {
  return stakes
    .filter(({ entity: _entity }) => entity === _entity)
    .map(({ time, tokensStaked, conviction }) => ({
      time,
      totalTokensStaked: tokensStaked,
      conviction,
    }))
}
