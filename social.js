document.addEventListener('DOMContentLoaded', () => {
    console.log('social.js: Script loaded at', new Date().toISOString());

    const socialTab = document.getElementById('social-tab');
    if (!socialTab) {
        console.error('social.js: Social tab with id="social-tab" not found');
        return;
    }

    const searchInput = document.getElementById('twitter-search');
    const searchButton = document.getElementById('twitter-search-btn');
    const tweetsContainer = document.getElementById('tweets-container');
    const loadingSpinner = document.getElementById('twitter-loading');
    const hazardFilter = document.getElementById('hazardFilter');
    const sentimentFilter = document.getElementById('sentimentFilter');
    const regionFilter = document.getElementById('regionFilter');
    const urgencyFilter = document.getElementById('urgencyFilter');
    const refreshButton = document.getElementById('refreshTweets');
    const socialMapContainer = document.getElementById('social-map');
    const tweetVolumeChartCanvas = document.getElementById('tweetVolumeChart');
    const sentimentChartCanvas = document.getElementById('sentimentChart');
    const hazardDistributionChartCanvas = document.getElementById('hazardDistributionChart');
    const trendingKeywordsContainer = document.getElementById('trendingKeywords');

    let dateFilter = document.getElementById('dateFilter');
    if (!dateFilter) {
        dateFilter = document.createElement('select');
        dateFilter.id = 'dateFilter';
        dateFilter.className = 'px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-accent focus:border-transparent font-sans text-sm font-medium';
        dateFilter.innerHTML = `
            <option value="all">All Time</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
        `;
        searchInput.parentElement.appendChild(dateFilter);
    }
    let sourceFilter = document.getElementById('sourceFilter');
    if (!sourceFilter) {
        sourceFilter = document.createElement('select');
        sourceFilter.id = 'sourceFilter';
        sourceFilter.className = 'px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-accent focus:border-transparent font-sans text-sm font-medium';
        sourceFilter.innerHTML = `
            <option value="all">All Sources</option>
            <option value="twitter">Twitter</option>
        `;
        searchInput.parentElement.appendChild(sourceFilter);
    }

    console.log('social.js: DOM Elements:', {
        socialTab: !!socialTab,
        searchInput: !!searchInput,
        searchButton: !!searchButton,
        tweetsContainer: !!tweetsContainer,
        loadingSpinner: !!loadingSpinner,
        hazardFilter: !!hazardFilter,
        sentimentFilter: !!sentimentFilter,
        regionFilter: !!regionFilter,
        urgencyFilter: !!urgencyFilter,
        dateFilter: !!dateFilter,
        sourceFilter: !!sourceFilter,
        refreshButton: !!refreshButton,
        socialMapContainer: !!socialMapContainer,
        tweetVolumeChartCanvas: !!tweetVolumeChartCanvas,
        sentimentChartCanvas: !!sentimentChartCanvas,
        hazardDistributionChartCanvas: !!hazardDistributionChartCanvas,
        trendingKeywordsContainer: !!trendingKeywordsContainer
    });

    if (!searchInput || !searchButton || !tweetsContainer || !loadingSpinner || !hazardFilter || !sentimentFilter || !regionFilter || !urgencyFilter || !dateFilter || !sourceFilter || !refreshButton || !socialMapContainer || !tweetVolumeChartCanvas || !sentimentChartCanvas || !hazardDistributionChartCanvas || !trendingKeywordsContainer) {
        console.error('social.js: Missing required DOM elements');
        if (tweetsContainer) tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">Error: Required elements not found</p>';
        return;
    }

    const socialMap = L.map('social-map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(socialMap);
    const markers = L.markerClusterGroup();
    socialMap.addLayer(markers);

    const observer = new MutationObserver(() => {
        if (!socialTab.classList.contains('hidden')) {
            setTimeout(() => {
                socialMap.invalidateSize();
                console.log('social.js: Invalidated map size on tab visibility change');
            }, 100);
        }
    });
    observer.observe(socialTab, { attributes: true, attributeFilter: ['class'] });

    setTimeout(() => socialMap.invalidateSize(), 100);

    const indianLocations = {
        'ANDAMAN AND NICOBAR ISLANDS': [11.7401, 92.6586],
        'ANDHRA PRADESH': [15.9129, 79.7400],
        'ARUNACHAL PRADESH': [28.2180, 94.7278],
        'ASSAM': [26.2006, 92.9378],
        'BIHAR': [25.0941, 85.3136],
        'CHHATTISGARH': [21.2514, 81.6299],
        'GOA': [15.2993, 74.1240],
        'GUJARAT': [22.2587, 71.1924],
        'HARYANA': [29.0588, 77.1984],
        'HIMACHAL PRADESH': [31.1048, 77.1734],
        'JAMMU AND KASHMIR': [33.7782, 76.5762],
        'JHARKHAND': [23.3441, 85.3096],
        'KARNATAKA': [15.3173, 75.7139],
        'KERALA': [10.8505, 76.2711],
        'MADHYA PRADESH': [22.9734, 78.6569],
        'MAHARASHTRA': [19.7515, 75.7139],
        'MANIPUR': [24.6638, 93.9063],
        'MEGHALAYA': [25.4670, 91.3662],
        'MIZORAM': [23.1645, 92.9378],
        'NAGALAND': [25.4670, 94.1230],
        'ODISHA': [20.9517, 85.0985],
        'PUNJAB': [30.7333, 76.7794],
        'RAJASTHAN': [27.0238, 74.2179],
        'SIKKIM': [27.5330, 88.5122],
        'TAMIL NADU': [11.1271, 78.6569],
        'TELANGANA': [17.3850, 78.4867],
        'TRIPURA': [23.9408, 91.9882],
        'UTTAR PRADESH': [26.8467, 80.9462],
        'UTTARAKHAND': [30.3165, 78.0322],
        'WEST BENGAL': [22.9868, 87.8550],
        'CHANDIGARH': [30.7333, 76.7794],
        'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': [20.4283, 72.8397],
        'DELHI': [28.7041, 77.1025],
        'LADAKH': [34.1526, 77.5770],
        'LAKSHADWEEP': [10.5667, 72.6417],
        'PUDUCHERRY': [11.9416, 79.8083],
        'MUMBAI': [19.0760, 72.8777],
        'CHENNAI': [13.0827, 80.2707],
        'KOLKATA': [22.5726, 88.3639],
        'SURAT': [21.1702, 72.8311],
        'VISAKHAPATNAM': [17.6868, 83.2185],
        'KOCHI': [9.9312, 76.2673],
        'PONDICHERRY': [11.9416, 79.8083],
        'MANGALORE': [12.9141, 74.8560],
        'VARKALA': [8.7333, 76.7167],
        'MARARI BEACH': [9.4833, 76.3167],
        'MUNNAR': [10.0892, 77.0596],
        'ALAPPUZHA': [9.4981, 76.3388],
        'KOLLAM': [8.8934, 76.6102],
        'THRISSUR': [10.5276, 76.2144],
        'KANNUR': [11.8743, 75.3707],
        'KASARGOD': [12.4981, 75.0102],
        'BHOPAL': [23.2599, 77.4126],
        'HYDERABAD': [17.3850, 78.4867],
        'AHMEDABAD': [23.0225, 72.5714],
        'PATNA': [25.5941, 85.1376],
        'LUCKNOW': [26.8467, 80.9462],
        'SUNDARBANS': [22.0000, 88.8000],
        'PARADI PADA VILLAGE': [21.1702, 72.8311],
        'DHARALI VILLAGE': [30.7333, 78.4667],
        'KHEER GANGA': [31.0000, 79.0000],
        'GODAVARI DELTA': [16.7667, 81.8000],
        'MAHANADI DELTA': [20.4667, 86.6667],
        'KRISHNA DELTA': [16.0000, 81.0000],
        'KOSHI RIVER': [26.0000, 86.0000],
        'TEESTA RIVER': [27.0000, 88.5000],
        'DAMODAR RIVER': [23.5000, 87.5000],
        'SABARMATI RIVER': [23.0000, 72.5000],
        'PENNAR RIVER': [14.0000, 79.0000],
        'VAIGAI RIVER': [10.0000, 78.0000],
        'KAVERI DELTA': [11.0000, 79.0000],
        'COLERON LAKE': [16.7167, 81.2167],
        'GOMTI RIVER': [26.8467, 80.9462],
        'YAMUNA RIVER': [28.7041, 77.1025],
        'GOMTI FLOOD PLAIN': [26.8467, 80.9462]
    };

    const GEMINI_API_KEY = 'AIzaSyBGP2sJBfDmlx6siVbnZRZN7tv4NNYdX9A';
    const GEMINI_MODEL = 'gemini-1.5-flash';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    let tweetsData = [];
    let tweetVolumeData = [];
    let lastSearchTime = Date.now();

    function isOnline() {
        return navigator.onLine;
    }

    async function fetchWithRetry(url, options, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    const data = await response.json();
                    return data.candidates[0].content.parts[0].text;
                }
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Invalid API key or quota exceeded. Get a new key at https://makersuite.google.com/app/apikey');
                }
                if (response.status === 404) {
                    throw new Error('Gemini model not found. Check model name or API version');
                }
                throw new Error(`API error: ${response.statusText} (${response.status})`);
            } catch (error) {
                console.warn(`social.js: Gemini attempt ${i + 1} failed: ${error.message}`);
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    async function searchTwitter(query = '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ്കാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml', max_results = 20) {
        console.log('social.js: Searching Twitter with query:', query, 'max_results:', max_results);
        loadingSpinner.classList.remove('hidden');
        tweetsContainer.innerHTML = '';
        markers.clearLayers();

        try {
            const response = await fetch('/api/twitter/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, max_results })
            });
            const data = await response.json();
            console.log('social.js: Search API Response:', data);

            if (data.error || !data.jobUUID) {
                console.error('social.js: Search Error:', data.error || 'No jobUUID');
                tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${data.error || 'No job UUID'}</p>`;
                loadingSpinner.classList.add('hidden');
                return;
            }

            const jobUUID = data.jobUUID;
            let attempts = 0;
            const maxAttempts = 10;

            const pollResults = async () => {
                if (attempts >= maxAttempts) {
                    console.error('social.js: Max polling attempts reached');
                    tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">Timeout: No results after 10 attempts</p>';
                    loadingSpinner.classList.add('hidden');
                    return;
                }

                attempts++;
                console.log('social.js: Polling attempt', attempts, 'for jobUUID:', jobUUID);

                try {
                    const resultResponse = await fetch(`/api/twitter/result/${jobUUID}`);
                    const resultData = await resultResponse.json();
                    console.log('social.js: Result API Response:', resultData);

                    if (resultData.error) {
                        console.error('social.js: Result Error:', resultData.error);
                        tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${resultData.error}</p>`;
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    if (resultData.length > 0) {
                        tweetsData = [];
                        await processTweetsWithGemini(resultData); // Processing is now handled in batches
                        updateTweetVolume();
                        applyFilters();
                        updateAnalytics();
                        updateMap(tweetsData);
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    setTimeout(pollResults, 2000 * attempts);
                } catch (error) {
                    console.error('social.js: Polling Error:', error.message);
                    if (attempts < maxAttempts) {
                        setTimeout(pollResults, 2000);
                    } else {
                        tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${error.message}</p>`;
                        loadingSpinner.classList.add('hidden');
                    }
                }
            };

            setTimeout(pollResults, 2000);
        } catch (error) {
            console.error('social.js: Search Request Error:', error.message);
            tweetsContainer.innerHTML = `<p class="text-red-600 font-sans text-sm">Error: ${error.message}</p>`;
            loadingSpinner.classList.add('hidden');
        }
    }

    async function processTweetsWithGemini(tweets) {
        const BATCH_SIZE = 3;
        const DISPLAY_DELAY = 1000; // Delay in ms between displaying each tweet
        let processedTweets = [];

        const promptTemplate = `Classify the following tweet into ONE of these categories:
- Emergency/Alert: High urgency, immediate danger (e.g., people in peril, evacuation needed).
- Observation/Neutral Report: Factual info without panic (e.g., "Waves spotted at beach").
- Panic/Fear: Expressions of fear, confusion, or exaggeration (e.g., "Everyone is dying!").
- Awareness/Official Info: Sharing warnings, official updates, or advice (e.g., "INCOIS alert for Kerala").

Extract: 
- Location (city/village/state if mentioned, e.g., "Chennai Marina Beach").
- Hashtags (array of #tags, e.g., ["#ChennaiFloods"]).

Flag misinformation/exaggeration? (yes/no, with brief reason if yes).

Respond ONLY in valid JSON: {{"category": "Category Name", "location": "Extracted Location", "hashtags": ["#tag1", "#tag2"], "misinfo_flag": true/false, "misinfo_reason": "Reason if flagged"}}.

Tweet: "{{TWEET_TEXT}}"

Metadata: Timestamp: {{TIMESTAMP}}, Geo: {{GEO}}, User: {{USER}}`;

        const online = isOnline();
        if (!online) {
            console.warn('social.js: No internet connection, using fallback processing');
            tweetsContainer.innerHTML += '<p class="text-yellow-600 font-sans text-sm mt-2">Offline mode: Using basic keyword analysis (no Gemini).</p>';
        }

        // Process tweets in batches of 3
        for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
            const batch = tweets.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async tweet => {
                const content = tweet.content || 'No content';
                let category, location, hashtags, misinfo_flag, misinfo_reason;

                if (online) {
                    const fullPrompt = promptTemplate
                        .replace('{{TWEET_TEXT}}', content.replace(/"/g, '\\"'))
                        .replace('{{TIMESTAMP}}', tweet.metadata?.created_at || 'Unknown')
                        .replace('{{GEO}}', tweet.metadata?.geo?.coordinates ? JSON.stringify(tweet.metadata.geo.coordinates) : 'No geo')
                        .replace('{{USER}}', tweet.metadata?.username || 'Unknown');

                    try {
                        const responseText = await fetchWithRetry(GEMINI_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: fullPrompt }] }],
                                generationConfig: {
                                    temperature: 0.1,
                                    response_mime_type: 'application/json'
                                }
                            })
                        });

                        let cleanedText = responseText.replace(/```json\n|\n```/g, '').trim();
                        let parsed;
                        try {
                            parsed = JSON.parse(cleanedText);
                        } catch (parseErr) {
                            console.warn('social.js: JSON parse failed for tweet:', content.substring(0, 50) + '...', parseErr.message, 'Response:', responseText);
                            parsed = { category: 'Observation/Neutral Report', location: 'Unknown', hashtags: [], misinfo_flag: false, misinfo_reason: '' };
                        }

                        category = parsed.category || 'Observation/Neutral Report';
                        location = parsed.location || 'Unknown';
                        hashtags = parsed.hashtags || [];
                        misinfo_flag = parsed.misinfo_flag || false;
                        misinfo_reason = parsed.misinfo_reason || '';
                    } catch (error) {
                        console.error('social.js: Gemini Processing Error for tweet:', content.substring(0, 50) + '...', error.message);
                        category = detectCategory(content);
                        location = 'Unknown';
                        hashtags = content.match(/#\w+/g) || [];
                        misinfo_flag = detectMisinfo(content);
                        misinfo_reason = misinfo_flag ? 'High numerical claims or extreme language detected' : '';
                    }
                } else {
                    category = detectCategory(content);
                    location = 'Unknown';
                    hashtags = content.match(/#\w+/g) || [];
                    misinfo_flag = detectMisinfo(content);
                    misinfo_reason = misinfo_flag ? 'High numerical claims or extreme language detected' : '';
                }

                const hazard = detectHazard(content);
                const urgency = determineUrgency(category, hazard);
                const tweetLocation = extractLocation(tweet, location);

                return {
                    ...tweet,
                    category,
                    categoryScore: online ? 1.0 : 0.5,
                    hazard,
                    urgency,
                    location: tweetLocation,
                    hashtags,
                    misinfo_flag,
                    misinfo_reason
                };
            });

            const batchResults = await Promise.all(batchPromises);
            processedTweets = processedTweets.concat(batchResults);
            tweetsData = processedTweets; // Update global tweetsData incrementally

            // Display tweets one by one with delay
            for (const tweet of batchResults) {
                await new Promise(resolve => setTimeout(resolve, DISPLAY_DELAY));
                displayTweets([tweet], true); // Append single tweet
            }

            // Add "More tweets coming..." message if more tweets are pending
            if (i + BATCH_SIZE < tweets.length) {
                tweetsContainer.innerHTML += '<p class="text-gray-600 font-sans text-sm text-center mt-4 mb-4" id="more-tweets">More tweets coming...</p>';
                await new Promise(resolve => setTimeout(resolve, DISPLAY_DELAY));
                const moreTweetsElement = document.getElementById('more-tweets');
                if (moreTweetsElement) moreTweetsElement.remove();
            }
        }

        console.log('social.js: Processed', processedTweets.length, 'tweets', online ? 'with Gemini' : 'with fallback');
        return processedTweets;
    }

    function detectCategory(content) {
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('help') || lowerContent.includes('evacuate') || lowerContent.includes('danger') || lowerContent.includes('emergency')) {
            return 'Emergency/Alert';
        } else if (lowerContent.includes('fear') || lowerContent.includes('scared') || lowerContent.includes('panic') || lowerContent.includes('!!!')) {
            return 'Panic/Fear';
        } else if (lowerContent.includes('alert') || lowerContent.includes('warning') || lowerContent.includes('official') || lowerContent.includes('incois')) {
            return 'Awareness/Official Info';
        }
        return 'Observation/Neutral Report';
    }

    function detectMisinfo(content) {
        const lowerContent = content.toLowerCase();
        return (lowerContent.includes('dead') && /\d{4,}/.test(content)) || lowerContent.includes('everyone') || lowerContent.includes('all gone');
    }

    function detectHazard(content) {
        const keywords = {
            flood: ['flood', 'flooding', 'inundation', 'बाढ़', 'வெள்ளம்', 'వరద', 'വെള്ളപ്പൊക്കം', 'വെള്ളം'],
            tsunami: ['tsunami', 'tidal wave', 'सुनामी', 'சுனாமி', 'సునామీ', 'സുനാമി'],
            waves: ['wave', 'high wave', 'swell', 'लहरें', 'அலைகள்', 'అలలు', 'തിരമാലകൾ'],
            erosion: ['erosion', 'coastal erosion', 'कटाव', 'அரிப்பு', 'కోత', 'ക്ഷയം'],
            storm: ['storm', 'cyclone', 'hurricane', 'तूफान', 'புயல்', 'తుఫాను', 'കൊടുങ്കാറ്റ്']
        };
        const lowerContent = content.toLowerCase();
        for (const [hazard, words] of Object.entries(keywords)) {
            if (words.some(word => lowerContent.includes(word.toLowerCase()))) {
                return hazard;
            }
        }
        return 'other';
    }

    function determineUrgency(category, hazard) {
        const highCategories = ['Emergency/Alert', 'Panic/Fear'];
        const mediumCategories = ['Observation/Neutral Report', 'Awareness/Official Info'];
        const highHazards = ['tsunami', 'flood', 'storm'];
        if (highCategories.includes(category) || highHazards.includes(hazard)) {
            return 'high';
        } else if (mediumCategories.includes(category) || hazard === 'waves' || hazard === 'erosion') {
            return 'medium';
        }
        return 'low';
    }

    function extractLocation(tweet, extracted = null) {
        const regions = Object.keys(indianLocations);
        let content = (tweet.content || '').toUpperCase();
        if (extracted && extracted !== 'Unknown') {
            content += ' ' + extracted.toUpperCase();
        }
        if (tweet.metadata?.location) {
            content += ' ' + tweet.metadata.location.toUpperCase();
        }

        const matchedRegion = regions.find(r => content.includes(r));
        if (matchedRegion) {
            return {
                coordinates: indianLocations[matchedRegion],
                region: matchedRegion
            };
        }

        if (tweet.metadata?.geo?.coordinates && Array.isArray(tweet.metadata.geo.coordinates) && tweet.metadata.geo.coordinates.length === 2) {
            return {
                coordinates: tweet.metadata.geo.coordinates,
                region: tweet.metadata.location || 'Unknown'
            };
        }

        return {
            coordinates: [20.5937, 78.9629],
            region: 'Unknown'
        };
    }

    function applyFilters() {
        const hazard = hazardFilter.value;
        const category = sentimentFilter.value;
        const region = regionFilter.value;
        const urgency = urgencyFilter.value;
        const dateRange = dateFilter.value;
        const source = sourceFilter.value;

        const now = new Date();
        let filteredTweets = tweetsData.filter(tweet => {
            const tweetDate = tweet.metadata?.created_at ? new Date(tweet.metadata.created_at) : now;
            const timeDiff = (now - tweetDate) / (1000 * 60 * 60);
            return (hazard === 'all' || tweet.hazard === hazard) &&
                   (category === 'all' || tweet.category.toLowerCase().includes(category.toLowerCase().replace('_', ' '))) &&
                   (region === 'all' || tweet.location.region === region) &&
                   (urgency === 'all' || tweet.urgency === urgency) &&
                   (source === 'all' || tweet.source === 'twitter') &&
                   (dateRange === 'all' ||
                    (dateRange === '24h' && timeDiff <= 24) ||
                    (dateRange === '7d' && timeDiff <= 168) ||
                    (dateRange === '30d' && timeDiff <= 720));
        });

        displayTweets(filteredTweets);
        updateMap(filteredTweets);
        updateAnalytics();
    }

    function updateTweetVolume() {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        tweetVolumeData.push({ time: timeLabel, count: tweetsData.length });
        if (tweetVolumeData.length > 10) tweetVolumeData.shift();
        tweetVolumeChart.data.labels = tweetVolumeData.map(d => d.time);
        tweetVolumeChart.data.datasets[0].data = tweetVolumeData.map(d => d.count);
        tweetVolumeChart.update();
    }

    function updateAnalytics() {
        const categoryCounts = {
            'Emergency/Alert': 0,
            'Observation/Neutral Report': 0,
            'Panic/Fear': 0,
            'Awareness/Official Info': 0,
            'Other': 0
        };
        tweetsData.forEach(tweet => {
            categoryCounts[tweet.category] = (categoryCounts[tweet.category] || 0) + 1;
        });
        categoryChart.data.datasets[0].data = Object.values(categoryCounts);
        categoryChart.update();

        const hazardCounts = { flood: 0, tsunami: 0, waves: 0, erosion: 0, storm: 0, other: 0 };
        tweetsData.forEach(tweet => hazardCounts[tweet.hazard]++);
        hazardDistributionChart.data.datasets[0].data = Object.values(hazardCounts);
        hazardDistributionChart.update();

        const hashtagCounts = {};
        tweetsData.flatMap(tweet => tweet.hashtags).forEach(tag => {
            const cleanTag = tag.toLowerCase();
            hashtagCounts[cleanTag] = (hashtagCounts[cleanTag] || 0) + 1;
        });
        const trending = Object.entries(hashtagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => `<span class="inline-block bg-blue-100 rounded-full px-3 py-1 text-sm font-semibold text-blue-700 mr-2 mb-2">#${tag.slice(1)}: ${count}</span>`)
            .join('');

        const misinfoCount = tweetsData.filter(tweet => tweet.misinfo_flag).length;

        trendingKeywordsContainer.innerHTML = `${trending || ''} <span class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm ml-2">⚠️ Suspect: ${misinfoCount}</span>` || '<p class="text-gray-600 font-sans text-sm">No trending hashtags.</p>';
    }

    function updateMap(tweets) {
        markers.clearLayers();
        let hasMarkers = false;
        tweets.forEach(tweet => {
            if (tweet.location.coordinates && Array.isArray(tweet.location.coordinates) && tweet.location.coordinates.length === 2) {
                const [lat, lng] = tweet.location.coordinates;
                const markerClass = `marker-${tweet.hazard}`;
                const marker = L.divIcon({
                    className: `custom-marker ${markerClass}`,
                    html: `<div>${tweet.hazard.charAt(0).toUpperCase()}${tweet.misinfo_flag ? '⚠️' : ''}</div>`,
                    iconSize: [28, 28]
                });
                const popupContent = `
                    <div class="p-2 max-w-xs">
                        <p class="font-semibold">${tweet.metadata?.username || 'Unknown User'}</p>
                        <p class="text-sm text-gray-700">${tweet.content.substring(0, 100)}...</p>
                        <p class="text-xs text-gray-500">Category: <span class="px-2 py-1 rounded-full ${getCategoryBadgeClass(tweet.category)}">${tweet.category} (${(tweet.categoryScore * 100).toFixed(1)}%)</span></p>
                        <p class="text-xs text-gray-500">Hazard: ${tweet.hazard}</p>
                        <p class="text-xs text-gray-500">Urgency: <span class="px-2 py-1 rounded-full ${tweet.urgency === 'high' ? 'bg-red-500 text-white' : tweet.urgency === 'medium' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}">${tweet.urgency}</span></p>
                        <p class="text-xs text-gray-500">Region: ${tweet.location.region}</p>
                        ${tweet.misinfo_flag ? `<p class="text-xs text-red-500 mt-1">⚠️ Potential Misinfo: ${tweet.misinfo_reason}</p>` : ''}
                        <p class="text-xs text-gray-500 mt-1">Hashtags: ${tweet.hashtags.join(', ')}</p>
                    </div>
                `;
                L.marker([lat, lng], { icon: marker }).bindPopup(popupContent).addTo(markers);
                hasMarkers = true;
            }
        });
        if (hasMarkers) {
            socialMap.fitBounds(markers.getBounds(), { padding: [20, 20] });
        }
        socialMap.invalidateSize();
        console.log('social.js: Updated map with', tweets.length, 'tweets');
    }

    function getCategoryBadgeClass(category) {
        if (category.includes('Emergency') || category.includes('Alert')) return 'bg-red-500 text-white';
        if (category.includes('Panic') || category.includes('Fear')) return 'bg-yellow-500 text-white';
        if (category.includes('Awareness') || category.includes('Official')) return 'bg-green-500 text-white';
        if (category.includes('Observation') || category.includes('Report')) return 'bg-blue-500 text-white';
        return 'bg-gray-500 text-white';
    }

    function displayTweets(tweets, append = false) {
        console.log('social.js: Displaying', tweets.length, 'tweets', append ? '(appending)' : '(replacing)');
        if (!tweets || tweets.length === 0) {
            if (!append) {
                tweetsContainer.innerHTML = '<p class="text-gray-600 font-sans text-sm">No tweets found matching filters.</p>';
            }
            return;
        }

        const tweetHTML = tweets.map((tweet) => {
            const username = tweet.metadata?.username || 'Unknown User';
            const content = tweet.content || 'No content';
            const createdAt = tweet.metadata?.created_at ? new Date(tweet.metadata.created_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Unknown Date';
            const retweetCount = tweet.metadata?.public_metrics?.retweet_count || 0;
            const likeCount = tweet.metadata?.public_metrics?.like_count || 0;
            const replyCount = tweet.metadata?.public_metrics?.reply_count || 0;
            const categoryBadgeClass = getCategoryBadgeClass(tweet.category);
            const urgencyBadgeClass = tweet.urgency === 'high' ? 'bg-red-500 text-white' :
                                      tweet.urgency === 'medium' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white';
            const misinfoBadge = tweet.misinfo_flag ? `<span class="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs ml-2">⚠️ Suspect: ${tweet.misinfo_reason}</span>` : '';

            const mediaUrls = content.match(/https:\/\/pbs\.twimg\.com\/media\/[^ \n]+|https:\/\/pbs\.gstatic\.com\/media\/[^ \n]+/g) || [];
            const images = mediaUrls.slice(0, 4).map(url => url.replace(/name=small/, 'name=large'));

            return `
                <div class="bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-100">
                    <div class="flex items-center space-x-3 mb-2">
                        <i class="fab fa-twitter text-blue-400 text-xl"></i>
                        <div>
                            <p class="font-semibold text-gov-primary">${username}</p>
                            <p class="text-sm text-gray-500">${createdAt} • ${tweet.location.region}</p>
                        </div>
                    </div>
                    <p class="mt-2 text-gray-700 font-sans text-sm mb-3">${content}</p>
                    ${images.length > 0 ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                            ${images.map(img => `<img src="${img}" alt="Tweet media" class="w-full h-48 object-cover rounded-lg" loading="lazy">`).join('')}
                        </div>
                    ` : ''}
                    <div class="flex items-center space-x-4 text-sm text-gray-500 mb-2">
                        <span><i class="fas fa-reply mr-1"></i> ${replyCount}</span>
                        <span><i class="fas fa-retweet mr-1"></i> ${retweetCount}</span>
                        <span><i class="fas fa-heart mr-1"></i> ${likeCount}</span>
                    </div>
                    <div class="flex items-center space-x-4 text-sm flex-wrap">
                        <span class="px-2 py-1 rounded-full ${categoryBadgeClass}">Category: ${tweet.category}</span>
                        <span class="px-2 py-1 rounded-full bg-gray-200 text-gray-700">Hazard: ${tweet.hazard}</span>
                        <span class="px-2 py-1 rounded-full ${urgencyBadgeClass}">Urgency: ${tweet.urgency}</span>
                        ${misinfoBadge}
                        ${tweet.hashtags.length > 0 ? `<span class="text-xs text-gray-500">Hashtags: ${tweet.hashtags.slice(0, 3).join(', ')}${tweet.hashtags.length > 3 ? '...' : ''}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (append) {
            tweetsContainer.innerHTML += tweetHTML;
        } else {
            tweetsContainer.innerHTML = tweetHTML;
        }

        console.log('social.js: Tweets rendered successfully');
    }

    searchButton.addEventListener('click', () => {
        if (!isOnline()) {
            tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">No internet connection. Please reconnect and try again.</p>';
            return;
        }
        const query = searchInput.value.trim() || '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ্কാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml';
        searchTwitter(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (!isOnline()) {
                tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">No internet connection. Please reconnect and try again.</p>';
                return;
            }
            const query = searchInput.value.trim() || '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ্কാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml';
            searchTwitter(query);
        }
    });

    refreshButton.addEventListener('click', () => {
        if (!isOnline()) {
            tweetsContainer.innerHTML = '<p class="text-red-600 font-sans text-sm">No internet connection. Please reconnect and try again.</p>';
            return;
        }
        const query = searchInput.value.trim() || '(tsunami OR flood OR waves OR erosion OR storm OR cyclone OR बाढ़ OR सुनामी OR வெள்ளம் OR వరద OR വെള്ളപ്പൊക്കം OR புயல் OR తుఫాను OR കൊടുങ্কാറ്റ്) lang:en OR lang:hi OR lang:ta OR lang:te OR lang:ml';
        searchTwitter(query);
    });

    hazardFilter.addEventListener('change', applyFilters);
    sentimentFilter.addEventListener('change', applyFilters);
    regionFilter.addEventListener('change', applyFilters);
    urgencyFilter.addEventListener('change', applyFilters);
    dateFilter.addEventListener('change', applyFilters);
    sourceFilter.addEventListener('change', applyFilters);

    console.log('social.js: Initialized successfully. Ready for searches.');
});