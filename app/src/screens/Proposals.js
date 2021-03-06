import React, { useCallback } from 'react'
import {
  DataView,
  Link,
  GU,
  Text,
  Box,
  Tag,
  textStyle,
  useTheme,
  Split,
  Tabs,
} from '@aragon/ui'
import { useConnectedAccount, useAppState } from '@aragon/api-react'
import { useBlockNumber } from '../BlockContext'
import { getCurrentConviction } from '../lib/conviction'

import {
  ConvictionBar,
  ConvictionTrend,
  ConvictionCountdown,
} from '../components/ConvictionVisuals'
import LocalIdentityBadge from '../components/LocalIdentityBadge/LocalIdentityBadge'
import FilterBar from '../components/FilterBar/FilterBar'
import Balance from '../components/Balance'

import { formatTokenAmount } from '../lib/token-utils'
import { addressesEqualNoSum as addressesEqual } from '../lib/web3-utils'

const ENTRIES_PER_PAGE = 6

const Proposals = React.memo(
  ({
    proposals,
    selectProposal,
    filteredProposals,
    proposalExecutionStatusFilter,
    proposalSupportStatusFilter,
    proposalTextFilter,
    handleProposalSupportFilterChange,
    handleExecutionStatusFilterChange,
    handleSearchTextFilterChange,
    myLastStake,
    requestToken,
    stakeToken,
    myStakes,
  }) => {
    const theme = useTheme()
    const connectedAccount = useConnectedAccount()
    const convictionFields =
      proposalExecutionStatusFilter === 0
        ? [
            { label: 'Conviction progress', align: 'start' },
            { label: 'Trend', align: 'start' },
          ]
        : []
    const beneficiaryField =
      proposalExecutionStatusFilter === 1
        ? [{ label: 'Beneficiary', align: 'start' }]
        : []
    const linkField =
      proposalExecutionStatusFilter === 1 || !requestToken
        ? [{ label: 'Link', align: 'start' }]
        : []
    const tabs = ['Open Proposals', 'Executed Proposals']
    const requestedField = requestToken
      ? [{ label: 'Requested', align: 'start' }]
      : []
    const statusField = requestToken
      ? [{ label: 'Status', align: 'start' }]
      : []

    const sortedProposals = filteredProposals
      .map(proposal => {
        const {
          convictionStakes,
          globalParams: { alpha },
        } = useAppState()
        const stakes = convictionStakes.filter(
          stake => stake.proposal === parseInt(proposal.id)
        )
        const blockNumber = useBlockNumber()
        return {
          ...proposal,
          conviction: getCurrentConviction(stakes, blockNumber, alpha),
        }
      })
      .sort(
        (a, b) => b.conviction - a.conviction // desc order
      )

    const handleTabChange = useCallback(
      tabIndex => {
        handleExecutionStatusFilterChange(tabIndex)
      },
      [handleExecutionStatusFilterChange]
    )

    const updateTextFilter = useCallback(
      textValue => {
        handleSearchTextFilterChange(textValue)
      },
      [handleSearchTextFilterChange]
    )

    return (
      <Split
        primary={
          <div>
            {requestToken && (
              <Tabs
                items={tabs}
                selected={proposalExecutionStatusFilter}
                onChange={handleTabChange}
              />
            )}
            <DataView
              fields={[
                { label: 'Proposal', align: 'start' },
                ...linkField,
                ...requestedField,
                ...convictionFields,
                ...beneficiaryField,
                ...statusField,
              ]}
              statusEmpty={
                <h2
                  css={`
                    ${textStyle('title2')};
                    font-weight: 600;
                  `}
                >
                  No proposals yet!
                </h2>
              }
              entries={sortedProposals}
              renderEntry={proposal => {
                const entriesElements = [
                  <IdAndTitle
                    id={proposal.id}
                    name={proposal.name}
                    selectProposal={selectProposal}
                  />,
                ]
                if (proposal.executed || !requestToken) {
                  entriesElements.push(
                    <Link href={proposal.link} external>
                      Read more
                    </Link>
                  )
                }
                if (requestToken) {
                  entriesElements.push(
                    <Amount
                      requestedAmount={proposal.requestedAmount}
                      requestToken={requestToken}
                    />
                  )
                }
                if (!proposal.executed) {
                  entriesElements.push(
                    <ProposalInfo
                      proposal={proposal}
                      myStakes={myStakes}
                      stakeToken={stakeToken}
                      requestToken={requestToken}
                    />,
                    <ConvictionTrend proposal={proposal} />
                  )
                }
                if (proposal.executed) {
                  entriesElements.push(
                    <LocalIdentityBadge
                      connectedAccount={addressesEqual(
                        proposal.creator,
                        connectedAccount
                      )}
                      entity={proposal.creator}
                    />
                  )
                }
                if (requestToken) {
                  entriesElements.push(
                    <ConvictionCountdown proposal={proposal} shorter />
                  )
                }
                return entriesElements
              }}
              tableRowHeight={14 * GU}
              heading={
                <FilterBar
                  proposalsSize={filteredProposals.length}
                  proposalStatusFilter={proposalSupportStatusFilter}
                  proposalTextFilter={proposalTextFilter}
                  handleProposalStatusFilterChange={
                    handleProposalSupportFilterChange
                  }
                  handleTextFilterChange={updateTextFilter}
                  disableDropDownFilter={proposalExecutionStatusFilter === 1}
                />
              }
              entriesPerPage={ENTRIES_PER_PAGE}
            />
          </div>
        }
        secondary={
          <div>
            <Box heading="Staking tokens">
              <div
                css={`
                  ${textStyle('body2')};
                  color: ${theme.contentSecondary};
                `}
              >
                Your tokens
              </div>
              <div
                css={`
                  ${textStyle('title2')};
                `}
              >
                {`${
                  stakeToken.balance !== undefined
                    ? formatTokenAmount(
                        parseInt(stakeToken.balance),
                        parseInt(stakeToken.tokenDecimals)
                      )
                    : '-'
                } ${stakeToken.tokenSymbol}`}
              </div>
              <div
                css={`
                  ${textStyle('body4')};
                  color: ${theme.contentSecondary};
                `}
              >
                {stakeToken.balance !== undefined
                  ? (parseInt(stakeToken.balance) /
                      parseInt(stakeToken.tokenSupply)) *
                    100
                  : '-'}
                % of total tokens
              </div>
            </Box>
            {myLastStake && myLastStake.tokensStaked > 0 && (
              <Box heading="My staked proposal" key={myLastStake.proposal}>
                <ProposalInfo
                  proposal={
                    proposals.filter(({ id }) => id === myLastStake.proposal)[0]
                  }
                  myStakes={myStakes}
                  stakeToken={stakeToken}
                  requestToken={requestToken}
                  selectProposal={selectProposal}
                />
              </Box>
            )}
            {requestToken && (
              <Box heading="Organization funds">
                <span
                  css={`
                    color: ${theme.contentSecondary};
                    ${textStyle('body2')}
                  `}
                >
                  Funding Pool
                </span>
                <Balance
                  {...requestToken}
                  color={theme.positive}
                  size={textStyle('title3')}
                />
              </Box>
            )}
          </div>
        }
        invert="horizontal"
      />
    )
  }
)

const ProposalInfo = ({
  proposal,
  stakeToken,
  myStakes,
  requestToken,
  selectProposal = false,
}) => (
  <div
    css={`
      width: ${23 * GU}px;
    `}
  >
    {selectProposal && (
      <IdAndTitle {...proposal} selectProposal={selectProposal} />
    )}
    <ConvictionBar proposal={proposal} withThreshold={requestToken} />
    {myStakes.has(proposal.id) && (
      <Tag>
        {`✓ Supported: ${myStakes.get(proposal.id)} ${stakeToken.tokenSymbol}`}
      </Tag>
    )}
  </div>
)

const IdAndTitle = ({ id, name, selectProposal }) => (
  <Link onClick={() => selectProposal(id)}>
    <Text color={useTheme().surfaceContent.toString()}>#{id}</Text>{' '}
    <Text color={useTheme().surfaceContentSecondary.toString()}>{name}</Text>
  </Link>
)

const Amount = ({
  requestedAmount = 0,
  requestToken: { symbol, decimals, verified },
}) => (
  <div>
    <Balance
      amount={requestedAmount}
      decimals={decimals}
      symbol={symbol}
      verified={verified}
    />
  </div>
)

export default Proposals
