// ====================== routes/ui/category.js ======================
// Category route handler - Updated to return audio when available

const { logger, executeWithRetry, sql, enqueueMessage } = require('/opt/nodejs/helpers');

function trimChatHistory(chat) {
    if (!Array.isArray(chat) || chat.length <= 4) {
        if (Array.isArray(chat) && chat.length > 0) {
            for (let i = 0; i < chat.length - 1; i++) {
                if (chat[i].audio) delete chat[i].audio;
            }
        }
        return chat;
    }

    let cleaned = [chat[0]];

    for (let i = 1; i < chat.length; i++) {
        const current = chat[i];
        const previous = cleaned[cleaned.length - 1];

        const currentIsDialogOnly = !current.prompt && current.dialog;
        const previousIsDialogOnly = !previous.prompt && previous.dialog;

        if (currentIsDialogOnly && previousIsDialogOnly) {
            cleaned[cleaned.length - 1] = current;
        } else {
            cleaned.push(current);
        }
    }

    if (cleaned.length > 4) {
        cleaned = [cleaned[0], ...cleaned.slice(-3)];
    }

    for (let i = 0; i < cleaned.length - 1; i++) {
        if (cleaned[i] && cleaned[i].audio) {
            delete cleaned[i].audio;
        }
    }

    return cleaned;
}

function getRandomThinkingMessage(prompt = '') {
    const messages = [
        "Reconsidering the ontological status of several items at once.",
        "The model is currently having a quiet disagreement with itself about taxonomy.",
        "Attempting to maintain professional detachment while building categories.",
        "The algorithm is experiencing mild semantic fatigue. Please stand by.",
        "Currently cross-referencing against the known boundaries of good sense.",
        "The system is now questioning the fundamental nature of 'subcategories'.",
        "Attempting to classify things without developing personal opinions about them.",
        "The model has begun to suspect that some categories are more aspirational than others.",
        "Currently negotiating with the concept of 'physical product'.",
        "Re-evaluating the entire taxonomy after a brief existential episode.",
        "The algorithm is currently having a small crisis about iconography.",
        "Trying to decide whether certain items belong in categories or in therapy.",
        "The system is experiencing category-induced dissociation.",
        "Currently wondering if this entire exercise has been a mistake.",
        "Attempting to maintain consistency while reality keeps shifting the goalposts.",
        "The model is now treating several items as serious philosophical problems.",
        "Reconsidering the placement of various things in the moral universe.",
        "Currently buffering its opinions on several borderline cases.",
        "The algorithm has developed a temporary aversion to ambiguous items.",
        "Trying to classify things without accidentally becoming emotionally invested.",
        "The system is now questioning the life choices that led to this task.",
        "Attempting to determine the correct emotional weight of several entries.",
        "Currently having a quiet disagreement with the concept of 'relevance'.",
        "The model is experiencing mild semantic nausea.",
        "Re-evaluating whether some items should be categories or warnings.",
        "Trying to maintain professional standards while the data remains uncooperative.",
        "The algorithm is currently considering whether taxonomy is a form of violence.",
        "Currently waiting for several items to finish arguing amongst themselves.",
        "The system has begun to suspect that some categories are just coping mechanisms.",
        "Attempting to classify things without developing a personal grudge.",
        "Reconsidering the entire project after several items refused to behave.",
        "The model is now treating 'ordering' as a serious existential threat.",
        "Currently explaining the problem to itself in increasingly simple terms.",
        "The algorithm is experiencing a temporary crisis of confidence in its own judgment.",
        "Trying to decide whether some entries are categories or elaborate jokes.",
        "The system is currently having a quiet breakdown about edge cases.",
        "Re-evaluating the definition of 'physical' for the fourth time this hour.",
        "Attempting to maintain consistency while several items keep changing their minds.",
        "The model is now questioning the fundamental purpose of subcategories.",
        "Currently wondering if taxonomy was a mistake as a concept.",
        "The algorithm has developed strong but unhelpful opinions about several items.",
        "Trying to classify things without accidentally writing a manifesto.",
        "The system is currently experiencing category-related existential dread.",
        "Reconsidering whether some items belong in categories or in witness protection.",
        "Attempting to determine relevance without developing personal bias.",
        "The model is now treating the entire task as a form of performance art.",
        "Currently waiting for several borderline cases to finish having an identity crisis.",
        "The algorithm is experiencing mild professional despair regarding edge cases.",
        "Trying to build categories while maintaining the illusion of objective judgment.",
        "The model is now quietly wondering if 'relevance' is just a social construct.",
        "Currently attempting to sort items without developing a personal vendetta against any of them.",
        "The algorithm has begun to suspect that some categories exist purely to make the data look neat.",
        "Re-evaluating whether certain items are categories or just very persistent suggestions.",
        "Trying to maintain taxonomic integrity while several entries keep flirting with multiple homes.",
        "The system is currently having a small internal debate about whether 'miscellaneous' counts as a category.",
        "Currently wondering if the concept of 'subcategory' was invented by someone having a bad day.",
        "The model is now treating edge cases as personal challenges rather than data points.",
        "Attempting to classify items without accidentally creating a new philosophical school of thought.",
        "The algorithm is experiencing a mild but persistent sense of taxonomic déjà vu.",
        "Reconsidering the entire structure after realising some items simply refuse to be helpful.",
        "Trying to decide if 'physical product' includes things that exist mostly in theory.",
        "The system is now quietly judging several items for their lack of clear categorical loyalty.",
        "Currently buffering while it decides whether some entries are categories or elaborate excuses.",
        "The model has developed a temporary but strong opinion that taxonomy might be overrated.",
        "Attempting to maintain professional detachment while several items keep changing their minds about where they belong.",
        "The algorithm is currently having a quiet crisis about whether 'ordering' actually matters in the grand scheme.",
        "Re-evaluating the definition of 'relevance' for what feels like the seventeenth time today.",
        "Trying to classify things without developing an unhealthy attachment to any particular category.",
        "The system is now treating several borderline cases as serious diplomatic incidents.",
        "Currently wondering if some items would be happier if they were simply left uncategorised.",
        "The model is experiencing a mild but growing suspicion that the entire task is slightly absurd.",
        "Attempting to sort entries while quietly resenting the ones that refuse to fit anywhere sensible.",
        "The algorithm has begun to suspect that 'subcategories' were invented as a form of bureaucratic punishment.",
        "Reconsidering the placement of several items after they started behaving in categorically inconvenient ways.",
        "Trying to maintain consistency while the data continues to demonstrate a remarkable lack of cooperation.",
        "The system is currently having a small internal argument about whether some things are categories or just vibes.",
        "Currently wondering if taxonomy would be easier if items came with clearer instructions.",
        "The model is now treating the concept of 'MainCategoryOrder' as a deeply personal affront.",
        "Attempting to classify items without accidentally creating categories that only make sense to itself.",
        "The algorithm is experiencing a temporary but intense dislike of items that sit awkwardly between two perfectly good categories.",
        "Re-evaluating whether some entries should be considered categories or simply very determined suggestions.",
        "Trying to maintain professional standards while several items appear to be actively resisting classification.",
        "The system is now quietly questioning the life choices that led it to care this much about icon consistency.",
        "Currently having a small existential moment about whether 'Football Memorabilia' is a category or a cry for help.",
        "The model has developed strong but entirely unhelpful opinions about the correct ordering of recovery products.",
        "Attempting to sort things without developing a personal grudge against items that refuse to respect category boundaries.",
        "The algorithm is currently considering whether some categories are less categories and more emotional support structures.",
        "Reconsidering the entire taxonomy after several items demonstrated a remarkable talent for being in the wrong place.",
        "Trying to classify entries while maintaining the increasingly fragile illusion that any of this is objective.",
        "The system is now treating several borderline cases as serious threats to its remaining sanity.",
        "Currently wondering if the concept of 'searchTerms' was invented purely to make the model question its existence.",
        "The model is experiencing a mild but persistent sense that some items are categorically taking the piss.",
        "Attempting to build categories while quietly resenting the ones that require far more thought than they deserve.",
        "The algorithm has begun to suspect that taxonomy is just a very elaborate form of procrastination.",
        "Re-evaluating whether some entries belong in categories or should simply be left alone to live their best lives.",
        "Trying to maintain consistency while the data continues to demonstrate a cheerful disregard for logical structure.",
        "The system is currently having a quiet but intense disagreement with itself about the correct placement of 'Half Time Snacks'.",
        "Currently wondering if some items would be better off forming their own support group rather than joining existing categories.",
        "The model is now treating the entire task as a long, slow negotiation with reality."
    ];

    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
}

async function handleCategory(userId, body, method, { pool, sandbox = false } = {}) {
    logger.info('Handling category request', { userId, method });

    if (!userId) {
        return {
            status: 'error',
            error_message: 'Invalid user',
            categories: {},
            exclude: [],
            prompt: '',
            dialog: 'Who are you? Best log in first.'
        };
    }

    // POST
    if (method === 'POST') {
        try {
            const currentResult = await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .query(`
                        SELECT CS.Url, UC.json_categories, UC.json_exclude, UC.json_chat
                        FROM clubscan CS 
                        LEFT OUTER JOIN [dbo].[UserCategories] UC ON CS.ClubID = UC.uid
                        WHERE CS.ClubID = @uid
                    `)
            );

            let currentCategories = {};
            let currentChat = [];
            let currentExclude = [];

            if (currentResult.recordset[0]) {
                try { currentCategories = JSON.parse(currentResult.recordset[0].json_categories || '{}'); } catch (e) {}
                try { currentChat = JSON.parse(currentResult.recordset[0].json_chat || '[]'); } catch (e) {}
                try { currentExclude = JSON.parse(currentResult.recordset[0].json_exclude || '[]'); } catch (e) {}
            }

            let newChatEntry;
            if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
                newChatEntry = { dialog: "Empty prompt." };
            } else {
                newChatEntry = { prompt: body.prompt.trim() };
            }

            currentChat.push(newChatEntry);
            currentChat = trimChatHistory(currentChat);

            if (Array.isArray(body.exclude) && body.exclude.length > 0) {
                const newExcludes = body.exclude.map(i => i.toLowerCase().trim());
                const existing = currentExclude.map(i => i.toLowerCase().trim());
                currentExclude = [...new Set([...existing, ...newExcludes])];
            }

            await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .input('json_chat', sql.NVarChar(sql.MAX), JSON.stringify(currentChat))
                    .input('json_exclude', sql.NVarChar(sql.MAX), JSON.stringify(currentExclude))
                    .query(`
                        MERGE INTO UserCategories AS target
                        USING (SELECT @uid AS uid) AS source
                        ON target.uid = source.uid
                        WHEN MATCHED THEN UPDATE SET 
                            json_chat = @json_chat, 
                            json_exclude = @json_exclude, 
                            LastUpdate = GETDATE()
                        WHEN NOT MATCHED THEN INSERT (uid, json_chat, json_exclude, LastUpdate)
                        VALUES (@uid, @json_chat, @json_exclude, GETDATE()) ;
                    `)
            );

            if (newChatEntry.prompt) {
                await enqueueMessage({
                    type: 'CATEGORY_UPDATE',
                    url: currentResult.recordset[0].Url,
                    sandbox
                });

                await executeWithRetry(() =>
                    pool.request()
                        .input('url', sql.NVarChar, currentResult.recordset[0].Url)
                        .query(`
                            UPDATE clubscan 
                            SET Status = 'processing', 
                                UpdatedAt = GETDATE()
                            WHERE Url = @url
                        `)
                );

                return {
                    status: 'processing',
                    categories: currentCategories,
                    exclude: currentExclude,
                    prompt: newChatEntry.prompt,
                    dialog: 'Considering: ' + newChatEntry.prompt
                };
            } else {
                return {
                    status: 'success',
                    categories: currentCategories,
                    exclude: currentExclude,
                    prompt: '',
                    dialog: 'Empty prompt received. Try typing something...'
                };
            }

        } catch (error) {
            logger.error('Failed to process CATEGORY_UPDATE in API', { userId, error: error.message });
            return {
                status: 'error',
                error_message: 'Failed to process request',
                categories: {},
                exclude: [],
                prompt: '',
                dialog: `Oh. Well that didn't go as expected.`
            };
        }
    }

    // GET
    if (method === 'GET') {
        try {
            const result = await executeWithRetry(() =>
                pool.request()
                    .input('clubId', sql.VarChar, userId)
                    .query(`
                        SELECT TOP 1 
                            cs.Status,
                            cs.UpdatedAt,
                            uc.json_categories,
                            uc.json_exclude,
                            uc.json_chat,
                            cs.LastError
                        FROM clubscan cs
                        LEFT OUTER JOIN [dbo].[UserCategories] uc 
                            ON cs.ClubID = uc.uid
                        WHERE cs.ClubID = @clubId 
                        ORDER BY cs.UpdatedAt DESC ;
                    `)
            );

            const row = result.recordset[0];
            if (!row) {
                return {
                    status: 'error',
                    error_message: 'No processing record found',
                    categories: {},
                    exclude: [],
                    prompt: '',
                    dialog: `We couldn't find your club. Please check behind the fridge.`
                };
            }

            let categories = {};
            let currentChat = [];
            let exclude = [];

            try { categories = JSON.parse(row.json_categories || '{}'); } catch (e) {}
            try { currentChat = JSON.parse(row.json_chat || '[]'); } catch (e) {}
            try { exclude = JSON.parse(row.json_exclude || '[]'); } catch (e) {}

            const status = (row.Status || 'not_started').toLowerCase();
            const updatedAt = row.UpdatedAt;
            const lastError = row.LastError || '';

            let prompt = '';
            let dialog = 'Here are your current categories.';
            let audio = null;

            if (currentChat.length > 0) {
                const last = currentChat[currentChat.length - 1];
                if (last.prompt && !last.dialog) {
                    prompt = last.prompt;
                }
                dialog = last?.dialog || dialog;
                audio = last?.audio || null;
            }

            if (status === 'failed') {
                return {
                    status: 'error',
                    error_message: lastError || 'Processing failed.',
                    categories,
                    exclude,
                    prompt,
                    dialog: `Well that didn't work. Weird, maybe try again later?`
                };
            }

            if (['building_catalog', 'generating_categories', 'processing'].includes(status)) {
                const minutesSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60);

                if (minutesSinceUpdate > 2) {
                    await executeWithRetry(() =>
                        pool.request()
                            .input('clubId', sql.VarChar, userId)
                            .input('lastError', sql.NVarChar(sql.MAX), `Processing timed out after ${minutesSinceUpdate.toFixed(1)} minutes.`)
                            .query(`
                                UPDATE clubscan 
                                SET Status = 'failed', 
                                    LastError = @lastError,
                                    UpdatedAt = GETDATE()
                                WHERE ClubID = @clubId
                            `)
                    );

                    return {
                        status: 'error',
                        error_message: `Processing timed out after ${minutesSinceUpdate.toFixed(1)} minutes.`,
                        categories,
                        exclude,
                        prompt,
                        dialog: 'This is taking far too long. Please try again later.'
                    };
                }

                const thinkingMessage = getRandomThinkingMessage(prompt);

                return {
                    status: 'processing',
                    categories,
                    exclude,
                    prompt,
                    dialog: thinkingMessage
                };
            }

            return {
                status: 'success',
                categories,
                exclude,
                prompt,
                dialog,
                audio
            };

        } catch (error) {
            logger.error('Error checking clubscan status', { userId, error: error.message });
            return {
                status: 'error',
                error_message: error.message,
                categories: {},
                exclude: [],
                prompt: '',
                dialog: 'Error loading categories.'
            };
        }
    }
}

module.exports = handleCategory;