document.addEventListener('DOMContentLoaded', function() {
  // DOM 元素

  const walletAddressSelect = document.getElementById('walletAddressSelect'); // Get the select element
  const recentTradesContainer = document.getElementById('recentTrades');
  const statusMessage = document.getElementById('statusMessage');
  const logOutput = document.getElementById('logOutput');
  const tradesWalletAddressSpan = document.getElementById('tradesWalletAddress'); // Span for selected wallet in trades header
  const walletPortfolioContainer = document.getElementById('walletPortfolioBody'); // Container for portfolio items
  const portfolioWalletAddressSpan = document.getElementById('portfolioWalletAddress'); // Span for selected wallet in portfolio header
  const portfolioLoadingElement = document.getElementById('portfolio-loading-row'); // Loading/placeholder element
  // Updated Token Info elements
  const tokenNameElement = document.getElementById('tokenName');
  const tokenSymbolElement = document.getElementById('tokenSymbol');
  const marketCapElement = document.getElementById('marketCap');
  const currentPriceElement = document.getElementById('currentPrice');
  const priceChange24hElement = document.getElementById('priceChange24h');
  const volume24hElement = document.getElementById('volume24h');
  const pairCreatedAtElement = document.getElementById('pairCreatedAt');
  const socialsElement = document.getElementById('socials'); // Note: This is now a span
  const tokenAvatarElement = document.getElementById('tokenAvatar'); // Get avatar element
  
  // 格式化时间戳为日期时间字符串
  function formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }
  
  // 格式化价格，保留适当的小数位
  function formatPrice(price) {
    return parseFloat(price).toFixed(10);
  }
  
  // 格式化成交量
  function formatVolume(volume) {
    return (parseFloat(volume)/1000000).toFixed(4).toLocaleString();
  }
  //格式化 SOL 金额
  function formatSolAmount(amount) {
    return (parseFloat(amount)/1000000000).toFixed(4).toLocaleString();
  }

  // Function to format token amounts (assuming standard decimals, adjust if needed)
  function formatTokenAmount(amount, decimals) {
      if (amount === undefined || amount === null || decimals === undefined || decimals === null) return '--';
      const divisor = Math.pow(10, decimals);
      return (parseFloat(amount) / divisor).toLocaleString(undefined, { maximumFractionDigits: decimals });
  }

  // Display recent trades
  function displayRecentTrades(trades, walletAddress) {
    recentTradesContainer.innerHTML = ''; // Clear previous trades

    if (!walletAddress) {
      recentTradesContainer.innerHTML = '<div class="list-group-item text-muted">请选择一个监控钱包。</div>';
      return;
    }

    if (!trades || trades.length === 0) {
      recentTradesContainer.innerHTML = '<div class="list-group-item text-muted">未找到该钱包的交易记录。</div>';
      return;
    }

    // Sort trades by timestamp descending (newest first)
    trades.sort((a, b) => b.timestamp - a.timestamp);

    trades.forEach(trade => {
      const tradeItem = document.createElement('div');
      tradeItem.classList.add('list-group-item', 'list-group-item-action', 'py-2'); // Use list-group classes

      const isBuy = trade.isBuy;
      const actionClass = isBuy ? 'text-success' : 'text-danger';
      const actionText = isBuy ? '买入' : '卖出';
      const price = trade.price !== undefined && trade.price !== null ? formatPrice(trade.price) : 'N/A';
      const tokenAmount = formatSolAmount(trade.tokenAmount); // Reuse SOL formatting logic for token amount potentially?
      const solAmount = formatSolAmount(trade.solAmount);
      const time = formatDateTime(trade.timestamp * 1000); // Assuming timestamp is in seconds
      const walletShort = `${trade.userWallet.substring(0, 4)}...${trade.userWallet.substring(trade.userWallet.length - 4)}`;

      // Simplified layout for list-group-item
      tradeItem.innerHTML = `
        <div class="d-flex w-100 justify-content-between mb-1">
          <small class="text-muted">${time}</small>
          <strong class="${actionClass}">${actionText}</strong>
        </div>
        <div class="d-flex w-100 justify-content-between">
          <span>价格: $${price}</span>
          <span>代币: ${tokenAmount}</span>
          <span>SOL: ${solAmount}</span>
        </div>
        <!-- <small class="text-muted">钱包: ${walletShort}</small> -->
      `;

      // Optional: Add highlighting based on the selected wallet
      if (walletAddress && trade.userWallet.toLowerCase() === walletAddress.toLowerCase()) {
        tradeItem.classList.add('active'); // Highlight trades from the selected wallet
      }

      recentTradesContainer.appendChild(tradeItem);
    });
  }

  // Display wallet portfolio
  function displayWalletPortfolio(portfolioData) {
      walletPortfolioContainer.innerHTML = ''; // Clear previous content

      if (!portfolioData.data || (!portfolioData.data.solBalance && (!portfolioData.data.tokens || portfolioData.data.tokens.length === 0))) {
          walletPortfolioContainer.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-3">无法加载资产信息或钱包为空。</td></tr>';
          return;
      }

      // SOL Balance Row
      if (portfolioData.data.solBalance > 0) { // Only show if SOL balance exists
          const solBalanceItem = document.createElement('tr');
          solBalanceItem.innerHTML = `
              <td class="align-middle"><img src="/wsol.webp" alt="SOL" class="rounded-circle me-2" style="width: 24px; height: 24px;">SOL</td>
              <td class="text-end align-middle">${portfolioData.data.solBalance} SOL</td>
              <td class="text-center align-middle"></td> <!-- No actions for SOL -->
              <td class="text-center align-middle"></td> <!-- No actions for SOL -->
          `;
          walletPortfolioContainer.appendChild(solBalanceItem);
      }

      // Token Rows
      if (portfolioData.data.tokens && portfolioData.data.tokens.length > 0) {
          portfolioData.data.tokens.forEach(token => {
              const tokenItem = document.createElement('tr');
              tokenItem.classList.add('portfolio-token-row'); // Add class for selection
              tokenItem.style.cursor = 'pointer'; // Make it look clickable

              const imageUrl = token.image || './placeholder-icon.png'; 
              const symbol = token.symbol || token.mint.substring(0, 6) + '...';
              const name = token.name || ''; // Store raw name
              const displayName = name ? `<small class="text-muted d-block">${name}</small>` : '';

              // Store data in attributes
              tokenItem.dataset.mint = token.mint;
              tokenItem.dataset.symbol = symbol;
              tokenItem.dataset.name = name;
              tokenItem.dataset.image = imageUrl;

              tokenItem.innerHTML = `
                  <td class="align-middle">
                      <img src="${imageUrl}" alt="${symbol}" class="rounded-circle me-2" style="width: 24px; height: 24px; object-fit: cover; background-color: #eee;" onerror="this.src='./placeholder-icon.png'; this.onerror=null;"> 
                      <span>${symbol}</span>
                      ${displayName}
                  </td>
                  <td class="text-end align-middle">${formatTokenAmount(token.amount, token.decimals)}</td>
                  <td class="text-center align-middle">
                      <button class="btn btn-sm btn-danger sell-button" title="卖出" data-mint="${token.mint}">卖出</button> 
                  </td>
              `;
              
              // Add click listener for the whole row (for showing details)
              tokenItem.onclick = function(event) { 
                  // Prevent row click if the click target was the sell button itself
                  if (event.target.classList.contains('sell-button')) return;
                  handlePortfolioRowClick(event);
               }; 

               // Add specific click listener for the sell button
               const sellButton = tokenItem.querySelector('.sell-button');
               if (sellButton) {
                   sellButton.onclick = function(event) { 
                       event.stopPropagation(); // Prevent triggering row click
                       handleSellButtonClick(event);
                    }; 
               }

              walletPortfolioContainer.appendChild(tokenItem);
          });
      } else if (!portfolioData.data.solBalance) {
           // Only show this if SOL also wasn't loaded and there are no tokens
          walletPortfolioContainer.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-3">此钱包没有持有任何代币。</td></tr>';
      }
  }

  // Function to display status messages
  function displayStatus(message, isError = false, timeout = 0) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'alert alert-danger' : 'alert alert-success';
    if (timeout > 0) {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
      }, timeout);
    }
  }

  // 获取Token Info和最近交易
  async function fetchData(tokenAddress) {
    const walletAddress = walletAddressSelect.value; // Get selected wallet address

    // Reset UI states for all sections
    displayStatus('正在加载数据...');
    resetTokenInfoUI('加载中...'); // Use a dedicated reset function
    resetPortfolioUI('加载中...');
    resetTradesUI('加载中...');

 
    // --- Define Fetch Operations ---
    const fetchTokenInfoPromise = fetchDexscreenerTokenInfo(tokenAddress);
    const fetchPortfolioPromise = fetchWalletPortfolio(walletAddress);
    const fetchTradesPromise = fetchRecentTrades(walletAddress);

    // --- Execute Fetches Concurrently ---
    const results = await Promise.allSettled([
        fetchTokenInfoPromise,
        fetchPortfolioPromise,
        fetchTradesPromise
    ]);

    // --- Process Results Independently ---
    const [tokenInfoResult, portfolioResult, tradesResult] = results;
    console.log('Token Info Result:', tokenInfoResult);
    console.log('Portfolio Result:', portfolioResult);
    console.log('Trades Result:', tradesResult);
    // Update Token Info UI
    if (tokenInfoResult.status === 'fulfilled' && tokenInfoResult.value.success) {
        displayTokenInfo(tokenInfoResult.value.data); // Call the new display function
    } else {
        const reason = tokenInfoResult.reason || tokenInfoResult.value?.reason || '未知错误';
        console.error("Token Info Fetch Failed:", reason);
        resetTokenInfoUI(`无法加载代币信息: ${reason.message || reason}`); // Use resetTokenInfoUI to display the error
    }

    // Update Portfolio UI
    if (portfolioResult.status === 'fulfilled' && portfolioResult.value.success) {
        displayWalletPortfolio(portfolioResult.value.data);
    } else {
        const reason = portfolioResult.reason || portfolioResult.value?.reason || '未知错误';
        console.error("Portfolio Fetch Failed:", reason);
        resetPortfolioUI(`无法加载: ${reason.message || reason}`);
    }

    // Update Trades UI
    if (tradesResult.status === 'fulfilled' && tradesResult.value.success) {
        displayRecentTrades(tradesResult.value.data);
    } else {
        const reason = tradesResult.reason || tradesResult.value?.reason || '未知错误';
        console.error("Trades Fetch Failed:", reason);
        resetTradesUI(`无法加载: ${reason.message || reason}`);
    }

    // Update overall status
    const allSucceeded = results.every(r => r.status === 'fulfilled' && r.value.success);
    const partiallyFailed = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    
    if (allSucceeded) {
        displayStatus('数据加载完成。', 'success');
    } else if (partiallyFailed) {
        displayStatus('部分数据加载失败，请检查日志。', 'warning');
    } else {
        // Should not happen if Promise.allSettled is used, but as a fallback
        displayStatus('数据加载遇到未知问题。', 'danger');
    }
  }

  // --- Helper Fetch Functions ---

  async function fetchDexscreenerTokenInfo(tokenAddress) {
      if (!tokenAddress) return { success: false, reason: "未提供代币地址" };
      const dexscreenerApiUrl = `https://api.dexscreener.com/token-pairs/v1/solana/${tokenAddress}`; // Use /tokens/ endpoint
   
      console.log(`Fetching Dexscreener info for: ${tokenAddress}`);
      try {
          const response = await fetch(dexscreenerApiUrl);
          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Dexscreener API 错误! Status: ${response.status}, Response: ${errorText}`);
          }
          const data = await response.json();
          if (data && data.length > 0) {
            const primaryPair = data[0]; // Assume first pair is most relevant
            const baseToken = primaryPair.baseToken;
            const info = primaryPair.info;
 
            return { success: true, data:{ primaryPair:primaryPair,baseToken:baseToken ,info: info}};
          }
          return {success:false,reason:""}
      } catch (error) {
          console.error('获取 Dexscreener 代币信息失败:', error);
          return { success: false, reason: error.message };
      }
  }

  async function fetchWalletPortfolio(walletAddress) {
      // Add check for placeholder value
      if (!walletAddress || walletAddress === '选择监控钱包...') {
           return { success: false, reason: "未选择有效钱包" };
      }
      console.log(`Fetching portfolio for: ${walletAddress}`);
      try {
          const response = await fetch(`/api/portfolio/${walletAddress}`);
          if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: '网络响应不正常' }));
             throw new Error(errorData.message || `HTTP 错误! status: ${response.status}`);
          }
          const data = await response.json();
          return { success: true, data: data }; // Assuming API returns { solBalance: ..., tokens: [...] }
      } catch (error) {
          console.error('获取钱包资产失败:', error);
          return { success: false, reason: error.message };
      }
  }

  async function fetchRecentTrades(walletAddress) {

       if (!walletAddress || walletAddress === '选择监控钱包...') {
           return { success: false, reason: "未选择有效钱包" };
       }
       console.log(`Fetching trades for: ${walletAddress}`);
       try {
           const response = await fetch(`/api/trades/${walletAddress}`);
           if (!response.ok) {
               const errorData = await response.json().catch(() => ({ message: '网络响应不正常' }));
               throw new Error(errorData.message || `HTTP 错误! status: ${response.status}`);
           }
           const data = await response.json();
           return { success: true, data: data }; // Assuming API returns an array of trades
       } catch (error) {
           console.error('获取最近交易失败:', error);
           return { success: false, reason: error.message };
       }
  }

  async function fetchSolscanTokenMeta(tokenAddress) {
    const solscanUrl = `https://pro-api.solscan.io/v2.0/token/meta?address=${tokenAddress}`;
    const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmVhdGVkQXQiOjE3NDI0NTAyNjM2MDQsImVtYWlsIjoia29uZ3dlaXdlaTIwMjJAZ21haWwuY29tIiwiYWN0aW9uIjoidG9rZW4tYXBpIiwiYXBpVmVyc2lvbiI6InYyIiwiaWF0IjoxNzQyNDUwMjYzfQ.a2zCnkdxhaiTNF9UPx7dLMCsYDEYZ5DX_pnxFKcpd4g'; // <<<--- ADD YOUR API KEY HERE (SECURELY)

    try {
        const response = await fetch(solscanUrl, {
            headers: {
                // Use the correct header name specified by Solscan Pro documentation (e.g., 'token', 'Authorization: Bearer ...', 'apikey')
                'token': apiKey // Example header, adjust if needed
            }
        });

        if (!response.ok) {
            const errorData = await response.text(); // Read error body as text
            throw new Error(`Solscan API request failed: ${response.status} ${response.statusText} - ${errorData}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
             // Basic validation: check if essential fields exist
            if (!data.data.symbol || !data.data.name || !data.data.address) {
                 console.warn("Solscan response missing essential fields (symbol, name, address)", data.data);
                 return { success: false, reason: 'Incomplete data from Solscan' };
            }
            return { success: true, data: data.data };
        } else {
            console.error("Solscan API call did not succeed or returned no data:", data);
            return { success: false, reason: data.message || 'Solscan API returned non-success or empty data' };
        }
    } catch (error) {
        console.error(`Error fetching Solscan token meta for ${tokenAddress}:`, error);
        return { success: false, reason: error.message || 'Network error or failed to fetch from Solscan' };
    }
  }

  // --- Helper: Find Primary Trading Pair ---
  function findPrimaryPair(pairs, baseTokenAddress) {
      if (!pairs || pairs.length === 0) return null;

      // Prioritize pairs against SOL, USDC, USDT
      const preferredQuotes = [
          'So11111111111111111111111111111111111111112', // SOL
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT (Wormhole)
      ];

      let bestPair = null;

      // 1. Exact match for baseToken and preferred quote
      for (const quote of preferredQuotes) {
          bestPair = pairs.find(p => 
              p.baseToken.address === baseTokenAddress && 
              p.quoteToken.address === quote
          );
          if (bestPair) break;
      }
      if (bestPair) return bestPair;
      
      // 2. Sort by liquidity (desc) among pairs where baseToken matches
      const matchingBase = pairs.filter(p => p.baseToken.address === baseTokenAddress);
      if (matchingBase.length > 0) {
        matchingBase.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
        return matchingBase[0]; // Return the one with highest liquidity
      }

      // 3. Fallback: Sort all pairs by liquidity and return the best one
      // (This might happen if the token address is the quote token in some pairs)
      pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      console.warn(`Could not find pair where ${baseTokenAddress} is base. Using highest liquidity pair overall: ${pairs[0]?.pairAddress}`);
      return pairs[0] || null; 
  }

  // --- Helper Reset Functions ---
  function resetTokenInfoUI(message = '请选择代币') {
      if (tokenSymbolElement) tokenSymbolElement.textContent = '-';
      if (tokenNameElement) tokenNameElement.textContent = message;
      if (tokenAvatarElement) tokenAvatarElement.src = ''; 
      if (marketCapElement) marketCapElement.textContent = '-';
      if (currentPriceElement) currentPriceElement.textContent = '-';
      if (priceChange24hElement) priceChange24hElement.textContent = '-';
      if (volume24hElement) volume24hElement.textContent = '-';
      if (pairCreatedAtElement) pairCreatedAtElement.textContent = '-';
      if (socialsElement) socialsElement.innerHTML = '-';
  }

  function resetPortfolioUI(message = '请选择钱包') {
      const colspan = 4; // Number of columns in the portfolio table
      walletPortfolioContainer.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted p-3">${message}</td></tr>`;
  }

  function resetTradesUI(message = '请选择钱包') {
      recentTradesContainer.innerHTML = `<div class="list-group-item text-muted text-center p-3">${message}</div>`;
  }

  // --- Display Functions (Ensure they exist and accept data) ---

  // NEW: Adapter for Solscan data -> displayTokenInfo format
  function adaptSolscanDataToDisplayFormat(solscanData) {
    if (!solscanData || !solscanData.address) {
        console.error("Invalid or missing Solscan data passed to adapter");
        return null; // Or throw error
    }

    // Create the structure expected by displayTokenInfo
    const adapted = {
        baseToken: {
            address: solscanData.address,
            name: solscanData.name || 'N/A',
            symbol: solscanData.symbol || 'N/A'
        },
        info: {
            imageUrl: solscanData.icon || solscanData.metadata?.image || './placeholder-icon.png',
            socials: [] // Initialize info.socials as an empty array
        },
        primaryPair: {
             // Solscan meta provides token price, not pair price, but we can use it
            priceUsd: solscanData.price?.toString() || 'N/A', 
            priceChange: {
                h24: solscanData.price_change_24h ?? 'N/A' 
            },
            volume: {
                h24: solscanData.volume_24h ?? 'N/A' // Assuming volume_24h is USD volume
            },
            marketCap: solscanData.market_cap ?? 'N/A',
            liquidity: { usd: 'N/A' }, // Not available in Solscan meta
            fdv: 'N/A', // Not available in Solscan meta
            pairCreatedAt: solscanData.created_time ? solscanData.created_time * 1000 : undefined // Convert Unix timestamp to ms
        },
        // Remove the redundant top-level socials property

    };

    // Add socials if available in metadata - now populating info.socials
    if (solscanData.metadata) {
        if (solscanData.metadata.website) {
            adapted.info.socials.push({ type: 'website', url: solscanData.metadata.website });
        }
        if (solscanData.metadata.twitter) {
            adapted.info.socials.push({ type: 'twitter', url: solscanData.metadata.twitter });
        }
        if (solscanData.metadata.telegram) {
            adapted.info.socials.push({ type: 'telegram', url: solscanData.metadata.telegram });
        }

        // Add other potential socials if needed (telegram, discord etc.)
    }
    // Add pump.fun link as a fallback if no other socials - now populating info.socials
    if (adapted.info.socials.length === 0 && solscanData.address) {
         adapted.info.socials.push({ 
            type: 'website', 
            url: `https://pump.fun/${solscanData.address}`
        });
    }


    console.log("Adapted Solscan Data:", adapted);
    return adapted;
  }


  // Display token info from Dexscreener data
  function displayTokenInfo(data) { // Renamed pairData to generic 'data'
      if (!data) {
          console.warn("displayTokenInfo called with null data");
          resetTokenInfoUI('无法显示代币信息');
          return;
      }
      console.log("Displaying token info for pair:", data);

      if (tokenSymbolElement) tokenSymbolElement.textContent = data.baseToken.symbol || 'N/A';
      if (tokenNameElement) tokenNameElement.textContent = data.baseToken.name || '';
      if (tokenAvatarElement) {
          // Dexscreener doesn't reliably provide icons here, might need separate lookup
          tokenAvatarElement.src = data.info?.imageUrl || './placeholder-icon.png'; 
          tokenAvatarElement.alt = data.baseToken.symbol;
          tokenAvatarElement.onerror = function() { this.src='./placeholder-icon.png'; this.onerror=null; };
          tokenAvatarElement.hidden = !tokenAvatarElement.src || tokenAvatarElement.src.endsWith('placeholder-icon.png');
      }

      if (marketCapElement) marketCapElement.textContent = data.primaryPair.marketCap ? `$${formatNumber(data.primaryPair.marketCap)}` : 'N/A';
      if (currentPriceElement) currentPriceElement.textContent = data.primaryPair.priceUsd ? `$${formatPrice(data.primaryPair.priceUsd)}` : 'N/A';
      if (priceChange24hElement) {
          const change = data.primaryPair.priceChange?.h24; // Use h24 for 24h change
          priceChange24hElement.textContent = typeof change === 'number' ? `${change.toFixed(2)}%` : 'N/A';
          priceChange24hElement.className = typeof change === 'number' ? (change >= 0 ? 'text-success' : 'text-danger') : 'text-muted';
      }
      if (volume24hElement) volume24hElement.textContent = typeof data.primaryPair.volume?.h24 === 'number' ? `$${formatNumber(data.primaryPair.volume.h24)}` : 'N/A'; // Use volume.h24
      if (pairCreatedAtElement) pairCreatedAtElement.textContent = data.primaryPair.pairCreatedAt ? formatTimestamp(data.primaryPair.pairCreatedAt) : 'N/A'; // Use pairCreatedAt

      if (socialsElement) {
           socialsElement.innerHTML = ''; // Clear previous
           const socials = data.info?.socials;
           if (socials && Array.isArray(socials) && socials.length > 0) {
               socials.forEach(social => {
                  if (social.url) {
                      const link = document.createElement('a');
                      link.href = social.url;
                      link.target = '_blank';
                      link.rel = 'noopener noreferrer';
                      link.className = 'me-2';
                      // Simple icons based on type
                      const type = social.type.toLowerCase();
                      if (type === 'twitter') link.innerHTML = '<i class="fab fa-twitter">twitter</i>';
                      else if (type === 'telegram') link.innerHTML = '<i class="fab fa-telegram-plane">telegram</i>';
                      else if (type === 'website') link.innerHTML = '<i class="fas fa-globe">website</i>';
                      else link.textContent = social.name || social.type;
                      socialsElement.appendChild(link);
                  }
               });
               if (socialsElement.innerHTML === '') {
                   socialsElement.textContent = '';
               }
           } else {
               socialsElement.textContent = '';
               // Attempt to add pump.fun link as a fallback
               if (data.baseToken?.address) {
                    const pumpLink = document.createElement('a');
                    pumpLink.href = `https://pump.fun/${data.baseToken.address}`;
                    pumpLink.target = '_blank';
                    pumpLink.rel = 'noopener noreferrer';
                    pumpLink.className = 'me-2';
                    pumpLink.title = 'Pump.fun';
                    pumpLink.innerHTML = '<img src="/pump-logo.webp" alt="Pump.fun" style="width: 16px; height: 16px; vertical-align: middle;">'; // Add a small pump logo if you have one
                    socialsElement.appendChild(pumpLink);
               }
           }
      }
  }


  // --- Event Listeners ---
  walletAddressSelect.addEventListener('change', () => {
    const defaultToken = "4M4ypzyZA7Sp2weYEMfnWuJ6wBVpNaMgaGTanmTspump"; // Or fetch a default token relevant to the wallet?
    fetchData(defaultToken); 
  });
 

  // 初始加载
  fetchData("4M4ypzyZA7Sp2weYEMfnWuJ6wBVpNaMgaGTanmTspump"); // Fetch default token data

  // Function to populate wallet dropdown
  async function populateWalletSelect() {
    try {
      const response = await fetch('/api/config/additional-wallets');
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        walletAddressSelect.innerHTML = ''; // Reset options without placeholder
        
        if (result.data.length > 0) {
          result.data.forEach((wallet, index) => {
            const option = document.createElement('option');
            option.value = wallet;
            // Display full wallet address
            option.textContent = `${wallet}`;
            // Automatically select the first wallet
            if (index === 0) {
              option.selected = true;
            }
            walletAddressSelect.appendChild(option);
          });
          
          // Trigger change event to load data for the selected wallet
          const changeEvent = new Event('change');
          walletAddressSelect.dispatchEvent(changeEvent);
        } else {
          // If no wallets available, show a message
          const option = document.createElement('option');
          option.disabled = true;
          option.selected = true;
          option.textContent = '没有可用的钱包';
          walletAddressSelect.appendChild(option);
        }
      } else {
        console.error('Failed to fetch or parse additional wallets', result.error || result.message);
        walletAddressSelect.innerHTML = '<option selected disabled>无法加载钱包列表</option>';
      }
    } catch (error) {
      console.error('Error fetching additional wallets:', error);
      walletAddressSelect.innerHTML = '<option selected disabled>加载钱包列表出错</option>';
    }
  }

  
  // 初始加载
  fetchData("4M4ypzyZA7Sp2weYEMfnWuJ6wBVpNaMgaGTanmTspump"); // Fetch default token data
  populateWalletSelect(); // Populate wallet dropdown

  // Function to connect to SSE log stream
  function connectLogStream() {
    // Ensure logOutput element exists
    if (!logOutput) {
      console.error("Log output element (#log-output) not found in the DOM.");
      return; 
    }

    const logSource = new EventSource('/api/logs/stream');
    logOutput.textContent = 'Connecting to log stream...\n'; // Initial message

    logSource.onmessage = function(event) {
      try {
        // Attempt to parse the log message (might be JSON stringified)
        let logData = event.data;
        try {
          const parsedData = JSON.parse(logData);
          // If it parses as a simple string, use that, otherwise format object
          logData = (typeof parsedData === 'string') ? parsedData : JSON.stringify(parsedData, null, 2);
        } catch (parseError) {
          // If parsing fails, assume it's already a plain string
          logData = event.data;
        }
        
        // Append log message
        logOutput.textContent += logData + '\n';
        
        // Auto-scroll to bottom
        logOutput.scrollTop = logOutput.scrollHeight;
      } catch (e) {
        console.error("Error processing log message:", e);
        logOutput.textContent += `Error processing log: ${event.data}\n`;
      }
    };

    logSource.onerror = function(error) {
      console.error('Log stream error:', error);
      logOutput.textContent += '--- Log stream connection error ---\n';
      logSource.close(); // Close on error
      // Optional: Attempt to reconnect after a delay
      setTimeout(connectLogStream, 5000); 
    };

    logSource.onopen = function() {
      console.log("Log stream connection opened.");
      logOutput.textContent = 'Connected to log stream.\n';
    };
  }

  // Start the log stream connection after initial setup
  connectLogStream(); 

  
  // Handles clicks on portfolio rows
  async function handlePortfolioRowClick(event) {
    event.preventDefault();
    console.log('Portfolio row clicked');
    const row = event.target.closest('tr.portfolio-token-row'); // Correct: Selects by class
    if (!row) return;
    console.log('Portfolio row clicked', row);

    // Read data attributes using the correct names from the HTML (data-mint, data-symbol, etc.)
    const tokenAddress = row.dataset.mint;         // Was: row.dataset.tokenAddress
    const tokenSymbol = row.dataset.symbol;        // Was: row.dataset.tokenSymbol
    const tokenName = row.dataset.name;          // Was: row.dataset.tokenName
    const tokenIcon = row.dataset.image;         // Was: row.dataset.tokenIcon
    
    if (!tokenAddress) {
      console.error("Token address not found on clicked row");
      return;
    }

    console.log(`Portfolio row clicked for token: ${tokenSymbol} (${tokenAddress})`);
    
    // **Step 1: Immediately update basic info and show loading state**
    // Replaced updateTokenInfoCardBasic with resetTokenInfoUI for consistency
    resetTokenInfoUI('加载详细信息...'); 
    if (tokenSymbolElement && tokenSymbol) tokenSymbolElement.textContent = tokenSymbol;
    if (tokenNameElement && tokenName) tokenNameElement.textContent = tokenName;
    if (tokenAvatarElement && tokenIcon) {
        tokenAvatarElement.src = tokenIcon;
        tokenAvatarElement.hidden = false;
        tokenAvatarElement.onerror = function() { this.src='./placeholder-icon.png'; this.onerror=null; };
    } else if (tokenAvatarElement) {
        tokenAvatarElement.hidden = true; // Hide if no icon provided
    }

    // **Step 2: Fetch detailed data specifically for this token**
    await fetchAndDisplayTokenDetails(tokenAddress);
  }

  // 获取并显示特定代币的详细信息 (由行点击触发)
  async function fetchAndDisplayTokenDetails(tokenAddress) {
    console.log(`Fetching details specifically for: ${tokenAddress}`);
    
    // Use the new helper function to fetch Dexscreener data
    const result = await fetchDexscreenerTokenInfo(tokenAddress);

    if (result.success) {
        // Use the new display function to update the UI
        displayTokenInfo(result.data);
        displayStatus('代币信息已更新。', 'success', 2000); // Provide feedback
    } else {
        console.warn(`Dexscreener fetch failed for ${tokenAddress}. Reason: ${result.reason}. Trying Solscan...`);
        const solscanResult = await fetchSolscanTokenMeta(tokenAddress);

        if (solscanResult.success && solscanResult.data) {
            // Adapt the Solscan data to the format displayTokenInfo expects
            const adaptedData = adaptSolscanDataToDisplayFormat(solscanResult.data);
            if (adaptedData) {
                 console.log(`Successfully fetched and adapted Solscan data for ${tokenAddress}`);
                 displayTokenInfo(adaptedData); // Display the adapted data
                 displayStatus('使用 Solscan 数据更新。', 'info', 2000); // Indicate fallback data
            } else {
                 // Handle case where adapter fails (should be rare if fetch succeeded)
                 console.error(`Failed to adapt Solscan data for ${tokenAddress}`);
                 resetTokenInfoUI(`加载失败: 无法处理Solscan数据`); 
                 displayStatus(`加载 ${tokenAddress} 失败`, 'danger', 3000);
            }
        } else {
             // Both Dexscreener and Solscan failed
             const finalErrorMessage = solscanResult.reason || result.reason || '无法加载代币详细信息';
             console.error(`Failed to fetch details for ${tokenAddress} from both Dexscreener and Solscan:`, finalErrorMessage);
             resetTokenInfoUI(`加载失败: ${finalErrorMessage}`); 
             displayStatus(`加载 ${tokenAddress} 失败`, 'danger', 3000);
        }
    }
  }

  // --- New Sell Button Handler ---
async function handleSellButtonClick(event) {
    const button = event.currentTarget; // Get the button that was clicked
    const mintAddress = button.dataset.mint; // Get mint address from data attribute
    const originalButtonText = button.textContent;
    const selectedWalletAddress = walletAddressSelect.value;

    if (!mintAddress) {
        console.error('Sell button clicked but mint address not found.');
        displayStatus('无法执行卖出操作：缺少代币地址。', 'danger');
        return;
    }

    // Get the selected trading wallet
    if (!selectedWalletAddress) {
        console.error('No trading wallet selected.');
        displayStatus('请先选择一个交易钱包。', 'warning');
        return;
    }

    const sellPercentage = 100; // Defaulting to 100%. Can be made dynamic later.

    console.log(`Attempting to sell ${sellPercentage}% of token: ${mintAddress} using wallet ${selectedWalletAddress}`);
 

    // Disable button and show loading state
    button.disabled = true;
    button.textContent = '处理中...';

    try {
        const apiUrl = `/api/portfolio/sell/${mintAddress}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                tradingWalletAddress: selectedWalletAddress, 
                sellPercentage 
            }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log('Sell successful (simulated):', result.details);
            displayStatus(`成功发起卖出 ${mintAddress} `, 'success', 5000);
            // Optionally: Update UI further, e.g., refresh portfolio
        } else {
            console.error('Sell failed:', result);
            displayStatus(`卖出失败: ${result.message || '未知错误'}`, 'danger', 5000);
        }
    } catch (error) {
        console.error('Error calling sell API:', error);
        displayStatus(`调用卖出API时出错: ${error.message}`, 'danger', 5000);
    } finally {
        // Re-enable button and restore original text
        button.disabled = false;
        button.textContent = originalButtonText;
    }
}

  // --- Utility Functions ---
  function formatNumber(num) {
    // Simple formatter, improve as needed
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  function formatPrice(price) {
      if (price === null || price === undefined) return 'N/A';
      // Adjust precision based on price magnitude
      return price; // Adjust as needed
  }

  function formatTimestamp(isoString) {
      if (!isoString) return 'N/A';
      try {
          const date = new Date(isoString);
          return date.toLocaleString(); // Adjust format as needed
      } catch (e) {
          return '无效日期';
      }
  }

  // Add formatSolAmount and formatTokenAmount if they aren't already defined globally
  function formatSolAmount(lamports) {
      if (lamports === null || lamports === undefined) return 'N/A';
      return (lamports / 1e9).toFixed(4) + ' SOL'; // SOL has 9 decimals
  }

  function formatTokenAmount(amount, decimals) {
      if (amount === null || amount === undefined || decimals === null || decimals === undefined) return 'N/A';
      const divisor = Math.pow(10, decimals);
      return (amount / divisor).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals });
  }

  // Ensure displayStatus exists or define a basic version
  function displayStatus(message, type = 'info') {
      if (statusMessage) {
          statusMessage.textContent = message;
          statusMessage.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'}`;
      }
      console.log(`Status (${type}): ${message}`);
  }
});
