// // What does this script do?
// // 1. Sells TSLA on alpaca for USD
// // 2. Buys USDC -> with USD
// // 3. Sends USDC -> contract for withdrawl

// // Return 0 on unsuccessful sell

const ASSET_TICKER = "TSLA"
const CRYPTO_TICKER = "USDCUSD"
// TODO
const RWA_CONTRACT = "0x26e81a5c1E36bBDf5A0416120362Ee8D4864F6ff"
const SLEEP_TIME = 5000 // 5 seconds

const FAILED_ORDER_STATUSES = ["canceled", "cancelled", "expired", "rejected", "suspended"]

async function main() {
    const amountTsla = args[0]
    const amountUsdc = args[1]
    _checkKeys()

    const soldTsla = await sellTslaForUsd(amountTsla)
    if (!soldTsla) {
        return Functions.encodeUint256(0)
    }

    const boughtUsdc = await buyUsdcWithUsd(amountTsla)
    if (!boughtUsdc) {
        return Functions.encodeUint256(0)
    }

    const sentUsdc = await sendUsdcToContractFlow(amountUsdc)
    if (!sentUsdc) {
        return Functions.encodeUint256(0)
    }

    return Functions.encodeUint256(amountUsdc)

}

async function sellTslaForUsd(amountTsla) {
    console.log("selling stock")
    const [id, orderStatus, responseStatus] = await placeOrder(
        ASSET_TICKER,
        amountTsla,
        "sell",
    )
    // console.log(client_order_id, orderStatus, responseStatus)
    console.log(id)

    if (responseStatus !== 200) {
        console.log("response not 200")
        return false
    }
    if (isFailedOrderStatus(orderStatus)) {
        console.log(`order failed early with status: ${orderStatus}`)
        return false
    }

    const filled = await waitForOrderToFill(id)
    console.log(filled);
    
    if (!filled) {
        // @audit, if this fails... That's probably an issue
        console.log("cancelling")

        await cancelOrder(id)
        return false
    }
    return true
}

async function buyUsdcWithUsd(amountTsla) {
    console.log("buying USDC")
    const [client_order_id, orderStatus, responseStatus] = await placeOrder(
        CRYPTO_TICKER,
        amountTsla,
        "buy",
    )

    if (responseStatus !== 200) {
        return false
    }
    if (isFailedOrderStatus(orderStatus)) {
        console.log(`order failed early with status: ${orderStatus}`)
        return false
    }

    const filled = await waitForOrderToFill(client_order_id)
    if (!filled) {
        // @audit, if this fails... That's probably an issue
        await cancelOrder(client_order_id)
        return false
    }
    return true
}

async function sendUsdcToContractFlow(amountUsdc) {
    console.log("sending USDC to contract")

    const transferId = await sendUsdcToContract(amountUsdc)
    if (transferId === null) {
        return false
    }

    const completed = await waitForCryptoTransferToComplete(transferId)
    if (!completed) {
        return false
    }
    return true
}

// returns string: client_order_id, string: orderStatus, int: responseStatus
async function placeOrder(symbol, qty, side) {
    // TODO, something is wrong with this request, need to fix
    const alpacaSellRequest = Functions.makeHttpRequest({
        method: "POST",
        url: "https://paper-api.alpaca.markets/v2/orders",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "APCA-API-KEY-ID": secrets.alpacaKey,
            "APCA-API-SECRET-KEY": secrets.alpacaSecret,
        },
        data: {
            side: side,
            type: "market",
            time_in_force: "gtc",
            symbol: symbol,
            qty: qty,
        },
    })

    const [response] = await Promise.all([alpacaSellRequest])
    const responseStatus = response.status
    console.log(`\nResponse status: ${responseStatus}\n`)
    // console.log(response)
    console.log(`\n`)
    console.log(response.data.status)
    console.log("destructuring for place order")

   if (!response || response.error || !response.data) {
       return [null, null, response?.status ?? 0]
   }
   const { id, status:orderStatus } = response.data
   return [id, orderStatus, response.status]
}

// returns int: responseStatus
async function cancelOrder(client_order_id) {
    console.log("cancelling")
    const alpacaCancelRequest = Functions.makeHttpRequest({
        method: "DELETE",
        url: `https://paper-api.alpaca.markets/v2/orders/${client_order_id}`,
        headers: {
            accept: "application/json",
            "APCA-API-KEY-ID": secrets.alpacaKey,
            "APCA-API-SECRET-KEY": secrets.alpacaSecret,
        },
    })

    const [response] = await Promise.all([alpacaCancelRequest])

    const responseStatus = response.status
    return responseStatus
}

// @returns bool
async function waitForOrderToFill(client_order_id) {
    console.log("waiting for order to fill")

    let numberOfSleeps = 0
    const capNumberOfSleeps = 10
    let filled = false
console.log(client_order_id)

    while (numberOfSleeps < capNumberOfSleeps) {
        const alpacaOrderStatusRequest = Functions.makeHttpRequest({
            method: "GET",
            url: `https://paper-api.alpaca.markets/v2/orders/${client_order_id}`,
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": secrets.alpacaKey,
                "APCA-API-SECRET-KEY": secrets.alpacaSecret,
            },
        })

        const [response] = await Promise.all([alpacaOrderStatusRequest])
console.log(response.data)
console.log(response.status)

        const responseStatus = response.status
        const { status: orderStatus } = response.data
        if (responseStatus !== 200) {
            return false
        }
        if (orderStatus === "filled") {
            filled = true
            break
        }
        numberOfSleeps++
        await sleep(SLEEP_TIME)
    }
    return filled
}

// returns string: transferId
async function sendUsdcToContract(usdcAmount) {
    console.log("sending usdc to contract")

    const transferRequest = Functions.makeHttpRequest({
        method: "POST",
        url: "https://paper-api.alpaca.markets/v2/wallets/transfers",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "APCA-API-KEY-ID": secrets.alpacaKey,
            "APCA-API-SECRET-KEY": secrets.alpacaSecret,
        },
        data: {
            amount: usdcAmount,
            address: RWA_CONTRACT,
            asset: CRYPTO_TICKER,
        },
    })

    const [response] = await Promise.all([transferRequest])
    if (response.status !== 200) {
        return null
    }
    return response.data.id
}

async function waitForCryptoTransferToComplete(transferId) {
    console.log("waiting for crypto transfer")

    let numberOfSleeps = 0
    const capNumberOfSleeps = 120 // 120 * 5 seconds = 10 minutes
    let completed = false

    while (numberOfSleeps < capNumberOfSleeps) {
        const alpacaTransferStatusRequest = Functions.makeHttpRequest({
            method: "GET",
            url: `https://paper-api.alpaca.markets/v2/wallets/transfers/${transferId}`,
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": secrets.alpacaKey,
                "APCA-API-SECRET-KEY": secrets.alpacaSecret,
            },
        })

        const [response] = await Promise.all([alpacaTransferStatusRequest])

        const responseStatus = response.status
        // @audit, the transfer could complete, but the response could be 400
        const { status: transferStatus } = response.data
        if (responseStatus !== 200) {
            return false
        }
        if (transferStatus === "completed") {
            completed = true
            break
        }
        numberOfSleeps++
        await sleep(SLEEP_TIME)
    }
    return completed
}

function _checkKeys() {
    if (secrets.alpacaKey == "" || secrets.alpacaSecret === "") {
        throw Error("need alpaca keys")
    }
}

function isFailedOrderStatus(orderStatus) {
    if (!orderStatus) {
        return true
    }
    return FAILED_ORDER_STATUSES.includes(orderStatus.toLowerCase())
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const result = await main()
return result
