let chartInstance = null;
let normalizedData = [];
let barChartInstance = null;
let independenceChartInstance = null;

// --- TAB NAVIGATION LOGIC ---
function openTab(event, tabId) {
    // 1. Hide all tab content boxes
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    // 2. Remove the 'active' highlight from all buttons
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // 3. Show the target tab and highlight the clicked button
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 1. Fetch data from the Java Backend
async function initDashboard() {
    try {
        const response = await fetch('/api/dashboard-data');
        if (!response.ok) throw new Error("Network response was not ok");

        const rawData = await response.json();
        processData(rawData);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('timeSlider').disabled = false;

        // Initial render at index 0 (oldest data)
        renderChart(0);

    } catch (error) {
        document.getElementById('loading').innerText = "Error loading data: " + error.message;
        console.error("Dashboard Error:", error);
    }
}

// 1. Normalize, Align, and Sort Heterogeneous Data
function processData(data) {
    // Note: Assuming 'profuturo' or 'sb pensiones promedio ponderado' depending on your JSON
    const aforeSeries = data.afores["profuturo"];
    const cetesSeries = data.cetes.bmx.series[0].datos;
    const exchangeSeries = data.exchange.bmx.series[0].datos;
    const btcSeries = data.btc;

    // A dictionary to group our disparate data by a unified 'YYYY-MM' key
    const monthlyAlignment = {};

    // Helper: Format Binance Unix timestamp to 'YYYY-MM'
    const getBtcMonth = (timestamp) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Helper: Format Banxico 'dd/MM/yyyy' to 'YYYY-MM'
    const getBanxicoMonth = (dateStr) => {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[1]}`;
    };

    // Step A: Populate the dictionary using Binance as the baseline (starts 2021)
    btcSeries.forEach(b => {
        const month = getBtcMonth(b[0]);
        monthlyAlignment[month] = { btcPriceUsd: parseFloat(b[4]) };
    });

    // Step B: Inject AFORE data where the month matches
    aforeSeries.forEach(aPoint => {
        const month = aPoint.date.substring(0, 7);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].aforeReturn = parseFloat(aPoint.amount);
        }
    });

    // Step C: Inject CETES (Since it's weekly, the loop will naturally keep the latest rate of the month)
    cetesSeries.forEach(cPoint => {
        const month = getBanxicoMonth(cPoint.fecha);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].cetesRate = parseFloat(cPoint.dato);
        }
    });

    // Step D: Inject Exchange Rate
    exchangeSeries.forEach(ePoint => {
        const month = getBanxicoMonth(ePoint.fecha);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].exchangeRate = parseFloat(ePoint.dato);
        }
    });

    // Step E: Filter out incomplete months, calculate MXN, and push to final array
    normalizedData = [];
    for (const monthKey in monthlyAlignment) {
        const dataPoint = monthlyAlignment[monthKey];

        // Only include months where ALL assets have data
        if (dataPoint.btcPriceUsd && dataPoint.aforeReturn &&
            dataPoint.cetesRate && dataPoint.exchangeRate) {

            dataPoint.month = monthKey;
            dataPoint.btcPriceMxn = dataPoint.btcPriceUsd * dataPoint.exchangeRate; // The Magic Formula
            normalizedData.push(dataPoint);
        }
    }

    // Step F: Sort chronologically to prevent looping chart lines
    normalizedData.sort((a, b) => a.month.localeCompare(b.month));
}

// 3. Render the Chart based on slider position
function renderChart(startIndex) {
    const slicedData = normalizedData.slice(startIndex);
    if (slicedData.length === 0) return;

    const labels = slicedData.map(d => d.month);

    // NEW: Dynamically grab the amount the user typed in the box
    const userInput = document.getElementById('monthlyInvestment').value;
    // Fallback to 1000 if they delete everything in the box to avoid math errors
    const monthlyContributionMxn = parseFloat(userInput) || 1000;

    const aforeGrowth = [];
    const cetesGrowth = [];
    const btcPortfolioValue = [];
    const exchangeRates = [];

    // Running totals
    let totalAforeBalance = 0;
    let totalCetesBalance = 0;
    let accumulatedBtcAmount = 0; // The actual fraction of a coin you own

    // NEW: Track purchasing power of cash under the mattress
    let mattressPurchasingPower = 0;
    const annualInflationRate = 0.055; // 5.5% estimated inflation

    slicedData.forEach((point) => {
        exchangeRates.push(point.exchangeRate);

        // 1. AFORE & CETES DCA Math
        // Add the $1,000 contribution, then apply that month's interest rate
        totalAforeBalance = (totalAforeBalance + monthlyContributionMxn) * (1 + (point.aforeReturn / 100) / 12);
        totalCetesBalance = (totalCetesBalance + monthlyContributionMxn) * (1 + (point.cetesRate / 100) / 12);

        aforeGrowth.push(totalAforeBalance);
        cetesGrowth.push(totalCetesBalance);

        // 2. Bitcoin DCA Math
        // Calculate how much fraction of a Bitcoin $1,000 MXN buys this month
        const btcBoughtThisMonth = monthlyContributionMxn / point.btcPriceMxn;
        accumulatedBtcAmount += btcBoughtThisMonth;

        // Calculate the total MXN value of your entire Bitcoin stash at this month's price
        const currentBtcPortfolioValueMxn = accumulatedBtcAmount * point.btcPriceMxn;
        btcPortfolioValue.push(currentBtcPortfolioValueMxn);

        // Mattress Math - Add the cash, but subtract the monthly inflation penalty
        mattressPurchasingPower = (mattressPurchasingPower + monthlyContributionMxn) * (1 - (annualInflationRate / 12));
    });

    // Pass the DCA arrays into the canvas
    //updateCanvas(labels, aforeGrowth, cetesGrowth, btcPortfolioValue, exchangeRates, slicedData);
    // Add the monthlyContributionMxn as the final argument
    updateCanvas(labels, aforeGrowth, cetesGrowth, btcPortfolioValue, exchangeRates, slicedData, monthlyContributionMxn);

    // Grab the final values at the end of the simulation and draw the Bar Chart
    const totalInvestedOutofPocket = slicedData.length * monthlyContributionMxn;
    const finalAfore = aforeGrowth[aforeGrowth.length - 1];
    const finalCetes = cetesGrowth[cetesGrowth.length - 1];
    const finalBtc = btcPortfolioValue[btcPortfolioValue.length - 1];

    document.getElementById('dateLabel').innerHTML = `<strong>Start Date:</strong> ${labels[0]}`;

    updateBarChart(totalInvestedOutofPocket, mattressPurchasingPower, finalAfore, finalCetes, finalBtc);
}

// 4. Chart.js Implementation with Secondary Y-Axis
//function updateCanvas(labels, aforeData, cetesData, btcData, exchangeData, rawDataReference) {
//    const ctx = document.getElementById('investmentChart').getContext('2d');
//
//    if (chartInstance) {
//        chartInstance.destroy();
//    }
//
//    chartInstance = new Chart(ctx, {
//        type: 'line',
//        data: {
//            labels: labels,
//            datasets: [
//                {
//                    label: 'Bitcoin Growth (Indexed)',
//                    data: btcData,
//                    borderColor: '#f39c12',
//                    backgroundColor: 'rgba(243, 156, 18, 0.1)',
//                    borderWidth: 2,
//                    fill: true,
//                    tension: 0.1,
//                    yAxisID: 'y' // Maps to the left axis
//                },
//                {
//                    label: 'CETES 28d Compounded',
//                    data: cetesData,
//                    borderColor: '#27ae60',
//                    borderWidth: 2,
//                    tension: 0.1,
//                    yAxisID: 'y'
//                },
//                {
//                    label: 'AFORE',
//                    data: aforeData,
//                    borderColor: '#2980b9',
//                    borderWidth: 2,
//                    tension: 0.1,
//                    yAxisID: 'y'
//                },
//                {
//                    label: 'USD/MXN Exchange Rate',
//                    data: exchangeData,
//                    borderColor: '#8e44ad', // A distinct purple
//                    borderDash: [5, 5], // Makes it a dashed line to differentiate from investments
//                    borderWidth: 2,
//                    tension: 0.1,
//                    yAxisID: 'y1', // NEW: Maps to the right axis
//                    pointRadius: 0 // Hides the dots to keep the chart clean
//                }
//            ]
//        },
//        options: {
//            responsive: true,
//            maintainAspectRatio: false,
//            interaction: {
//                mode: 'index',
//                intersect: false,
//            },
//            plugins: {
//                tooltip: {
//                    callbacks: {
//                        label: function(context) {
//                            let label = context.dataset.label || '';
//                            if (label) {
//                                label += ': ';
//                            }
//                            // Format exchange rate differently than indexed points
//                            if (context.datasetIndex === 3) {
//                                label += '$' + context.parsed.y.toFixed(2) + ' MXN';
//                            } else {
//                                label += context.parsed.y.toFixed(2) + ' pts';
//                            }
//                            return label;
//                        },
//                        afterLabel: function(context) {
//                            if (context.datasetIndex === 0) {
//                                const index = context.dataIndex;
//                                const specificMonthData = rawDataReference[index];
//
//                                const mxnPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(specificMonthData.btcPriceMxn);
//                                const usdPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(specificMonthData.btcPriceUsd);
//
//                                return [
//                                    `→ Actual Price: ${mxnPrice}`,
//                                    `→ USD Price: ${usdPrice}`
//                                ];
//                            }
//                            return null;
//                        }
//                    }
//                }
//            },
//             scales: {
//                y: {
//                    type: 'linear',
//                    display: true,
//                    position: 'left',
//                    title: { display: true, text: 'Total Portfolio Value (MXN)' }, // <-- UPDATE THIS
//                    ticks: {
//                        callback: function(value) {
//                            return '$' + value.toLocaleString(); // Adds commas to the axis numbers
//                        }
//                    }
//                },
//                y1: {
//                    type: 'linear',
//                    display: true,
//                    position: 'right',
//                    title: { display: true, text: 'USD/MXN Exchange Rate' },
//                    grid: {
//                        drawOnChartArea: false, // Prevents right-axis grid lines from overlapping left-axis lines
//                    }
//                }
//            }
//        }
//    });
//}
// 4. Chart.js Implementation with Advanced DCA Tooltips
function updateCanvas(labels, aforeData, cetesData, btcData, exchangeData, rawDataReference, monthlyContributionMxn) {
    const ctx = document.getElementById('investmentChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Currency formatter for clean Mexican Peso visuals
    const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Bitcoin Portfolio',
                    data: btcData,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243, 156, 18, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'CETES 28d Compounded',
                    data: cetesData,
                    borderColor: '#27ae60',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'AFORE',
                    data: aforeData,
                    borderColor: '#2980b9',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'USD/MXN Exchange Rate',
                    data: exchangeData,
                    borderColor: '#8e44ad',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y1',
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';

                            if (context.datasetIndex === 3) {
                                label += '$' + context.parsed.y.toFixed(2) + ' MXN';
                            } else {
                                label += mxnFormatter.format(context.parsed.y);
                            }
                            return label;
                        },
                        afterLabel: function(context) {
                            // Skip extra math for the exchange rate line
                            if (context.datasetIndex === 3) return null;

                            const index = context.dataIndex;
                            const currentValue = context.parsed.y;

                            // MATH: (Index + 1) gives us the number of months that have passed
                            const totalInvested = (index + 1) * monthlyContributionMxn;
                            const profitOrLoss = currentValue - totalInvested;
                            const profitMargin = (profitOrLoss / totalInvested) * 100;

                            // Build the multi-line tooltip array
                            let tooltipLines = [
                                `→ Total Out-of-Pocket: ${mxnFormatter.format(totalInvested)}`,
                                `→ Profit/Loss: ${mxnFormatter.format(profitOrLoss)} (${profitMargin > 0 ? '+' : ''}${profitMargin.toFixed(2)}%)`
                            ];

                            // If hovering over Bitcoin, append the spot price info too
                            if (context.datasetIndex === 0) {
                                const specificMonthData = rawDataReference[index];
                                const btcSpotMxn = mxnFormatter.format(specificMonthData.btcPriceMxn);
                                tooltipLines.push(`→ BTC Spot Price: ${btcSpotMxn}`);
                            }

                            return tooltipLines;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Total Portfolio Value (MXN)' },
                    ticks: {
                        callback: function(value) {
                            return mxnFormatter.format(value);
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'USD/MXN Exchange Rate' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function updateBarChart(totalInvested, mattressValue, aforeValue, cetesValue, btcValue) {
    const ctx = document.getElementById('summaryBarChart').getContext('2d');

    if (barChartInstance) {
        barChartInstance.destroy();
    }

    const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['The Mattress (Cash)', 'AFORE', 'CETES 28d', 'Bitcoin DCA'],
            datasets: [
                {
                    // THE BASELINE: A line representing the raw cash put in
                    type: 'line',
                    label: 'Total Cash Saved (Out of Pocket)',
                    data: [totalInvested, totalInvested, totalInvested, totalInvested],
                    borderColor: '#2c3e50',
                    borderWidth: 3,
                    borderDash: [10, 5],
                    fill: false,
                    pointRadius: 0
                },
                {
                    // THE BARS: The actual current value of those assets
                    type: 'bar',
                    label: 'Purchasing Power Today',
                    data: [mattressValue, aforeValue, cetesValue, btcValue],
                    backgroundColor: [
                        '#e74c3c', // Red for Mattress (loss)
                        'rgba(41, 128, 185, 0.7)', // Blue for AFORE
                        'rgba(39, 174, 96, 0.7)', // Green for CETES
                        'rgba(243, 156, 18, 0.8)'  // Orange for Bitcoin
                    ],
                    borderColor: [
                        '#c0392b',
                        '#2980b9',
                        '#27ae60',
                        '#f39c12'
                    ],
                    borderWidth: 2,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'The Cost of Doing Nothing (Final Value vs. Inflation)',
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + mxnFormatter.format(context.parsed.y);
                        },
                        afterLabel: function(context) {
                            // Only calculate profit/loss for the Bars, not the dotted line
                            if (context.dataset.type === 'line') return null;

                            const currentValue = context.parsed.y;
                            const difference = currentValue - totalInvested;
                            const percentage = ((difference / totalInvested) * 100).toFixed(2);

                            if (difference < 0) {
                                return `→ Invisible Thief (Inflation): Lost ${mxnFormatter.format(Math.abs(difference))} in purchasing power.`;
                            } else {
                                return `→ Wealth Built: +${mxnFormatter.format(difference)} (+${percentage}%)`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Value (MXN)' },
                    ticks: {
                        callback: function(value) { return mxnFormatter.format(value); }
                    }
                }
            }
        }
    });
}

// Slider Event Listener
document.getElementById('timeSlider').addEventListener('input', (e) => {
    // Convert 0-100 range to actual array index
    const maxIndex = normalizedData.length - 2; // Keep at least 2 data points visible
    const calculatedIndex = Math.floor((e.target.value / 100) * maxIndex);
    renderChart(calculatedIndex);
});
// Listen for changes on the custom investment input
document.getElementById('monthlyInvestment').addEventListener('input', () => {
    // Re-calculate the current index based on where the slider currently is
    const sliderValue = document.getElementById('timeSlider').value;
    const maxIndex = normalizedData.length - 2;
    const calculatedIndex = Math.floor((sliderValue / 100) * maxIndex);

    // Redraw the chart with the new investment amount
    renderChart(calculatedIndex);
});

function renderIndependenceChart() {
    // 1. Get user goals
    const targetMonthlyIncome = parseFloat(document.getElementById('targetIncome').value) || 30000;
    const years = parseFloat(document.getElementById('yearsToRetire').value) || 20;

    // 2. The Rule of 25 to find the Target Nest Egg
    const targetNestEgg = targetMonthlyIncome * 12 * 25;
    const totalMonths = years * 12;

    // 3. Projected Average Annual Real Returns (Adjusted for Inflation)
    // These are conservative estimates for the future, not guarantees.
    const rates = {
        mattress: 0.0,      // 0% growth
        cetes: 0.03,        // 3% real return
        afore: 0.05,        // 5% real return
        bitcoin: 0.15       // 15% conservative real return for maturity phase
    };

    // Helper function to calculate PMT
    function calculateRequiredMonthly(rateAnnual, target, months) {
        if (rateAnnual === 0) return target / months;
        const rMonthly = rateAnnual / 12;
        return (target * rMonthly) / (Math.pow(1 + rMonthly, months) - 1);
    }

    const reqMattress = calculateRequiredMonthly(rates.mattress, targetNestEgg, totalMonths);
    const reqCetes = calculateRequiredMonthly(rates.cetes, targetNestEgg, totalMonths);
    const reqAfore = calculateRequiredMonthly(rates.afore, targetNestEgg, totalMonths);
    const reqBitcoin = calculateRequiredMonthly(rates.bitcoin, targetNestEgg, totalMonths);

    // 4. Draw the Chart
    const ctx = document.getElementById('independenceChart').getContext('2d');
    if (independenceChartInstance) independenceChartInstance.destroy();

    const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

    independenceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['The Mattress (Cash)', 'CETES 28d', 'AFORE', 'Bitcoin DCA'],
            datasets: [{
                label: 'Required Monthly Savings (MXN)',
                data: [reqMattress, reqCetes, reqAfore, reqBitcoin],
                backgroundColor: ['#e74c3c', '#27ae60', '#2980b9', '#f39c12'],
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Makes the bar chart horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Target: ${mxnFormatter.format(targetNestEgg)} Nest Egg in ${years} Years`,
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'You must save: ' + mxnFormatter.format(context.parsed.x) + ' every month';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Required Monthly Contribution (MXN)' },
                    ticks: { callback: function(value) { return mxnFormatter.format(value); } }
                }
            }
        }
    });
}

// Listeners for the new inputs
document.getElementById('targetIncome').addEventListener('input', renderIndependenceChart);
document.getElementById('yearsToRetire').addEventListener('input', renderIndependenceChart);

// --- EXPORT TO IMAGE FEATURE ---
// --- EXPORT TO IMAGE FEATURE (With Watermark & UI Hiding) ---
document.getElementById('downloadBtn').addEventListener('click', function() {
    const dashboardElement = document.querySelector('.dashboard-container');
    const originalBtnText = this.innerText;

    // 1. Identify the UI clutter we want to hide in the final image
    const tabNav = document.querySelector('.tab-navigation');
    const exportBtnContainer = this.parentElement;

    // 2. Dynamically create the Watermark
    let watermark = document.getElementById('export-watermark');
    if (!watermark) {
        watermark = document.createElement('div');
        watermark.id = 'export-watermark';
        watermark.style.textAlign = 'right';
        watermark.style.color = '#95a5a6';
        watermark.style.fontSize = '0.9rem';
        watermark.style.marginTop = '25px';
        watermark.style.paddingTop = '15px';
        watermark.style.borderTop = '1px solid #ecf0f1';
        watermark.style.fontStyle = 'italic';
        // Feel free to customize this text!
        watermark.innerHTML = '<strong>📊 Powered by BitInvestment</strong> | Real Historical Data';
        dashboardElement.appendChild(watermark);
    }

    // 3. Prepare the DOM for the screenshot (Hide UI, Show Watermark)
    this.innerText = "📸 Generating Image...";
    this.disabled = true;

    tabNav.style.display = 'none'; // Hides the top tab buttons
    exportBtnContainer.style.display = 'none'; // Hides the download button
    watermark.style.display = 'block'; // Reveals the watermark

    // 4. Take the screenshot using HTML2Canvas
    html2canvas(dashboardElement, {
        scale: 2, // High resolution
        backgroundColor: '#ffffff', // Pure white background looks better for saved images
        useCORS: true
    }).then(canvas => {
        // Convert and trigger download
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.href = imgData;
        link.download = 'Financial_Analysis_Report.png';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 5. Instantly restore the UI back to normal
        tabNav.style.display = 'flex';
        exportBtnContainer.style.display = 'block';
        watermark.style.display = 'none';
        this.innerText = originalBtnText;
        this.disabled = false;

    }).catch(err => {
        console.error("Error generating image:", err);
        alert("Failed to generate the infographic. Please try again.");

        // Ensure UI restores even if it fails
        tabNav.style.display = 'flex';
        exportBtnContainer.style.display = 'block';
        watermark.style.display = 'none';
        this.innerText = originalBtnText;
        this.disabled = false;
    });
});

// Start the app
initDashboard();
// Initialize it on load
renderIndependenceChart();