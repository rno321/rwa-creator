-include .env

.PHONY: deploy

deploy :; @forge script script/DeployDTsla.s.sol:DeployDTsla --via-ir --private-key ${PRIVATE_KEY} \
--rpc-url ${SEPOLIA_RPC_URL} --priority-gas-price 1 --etherscan-api-key ${ETHERSCAN_API_KEY} --verify --broadcast

deploy-anvil :; forge script --via-ir script/DeployDTsla.s.sol:DeployDTsla \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast