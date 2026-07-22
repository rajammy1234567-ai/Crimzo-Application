const Task = require('../models/Task');
const { FREE_PLATFORM_GRANTS_ENABLED } = require('../config/balancePolicy');

/**
 * Task catalogue for engagement UI.
 * Free reward_amount is 0 unless FREE_PLATFORM_GRANTS=true — money only via purchase / real earn.
 */
const TASK_REWARDS_ON = FREE_PLATFORM_GRANTS_ENABLED;

const DEFAULT_TASKS = [
  { key: 'newbie_nickname', title: 'Enter your nickname', section: 'newbie', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 50 : 0, max_count: 1, action_type: 'manual', deep_link: '/profile/edit', sort_order: 1 },
  { key: 'newbie_avatar', title: 'Upload Avatar', section: 'newbie', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 50 : 0, max_count: 1, action_type: 'manual', deep_link: '/profile/edit', sort_order: 2 },
  { key: 'newbie_phone', title: 'Bind phone number', section: 'newbie', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 100 : 0, max_count: 1, action_type: 'manual', deep_link: '/profile/wallet', sort_order: 3 },
  { key: 'daily_live_message', title: 'Send a message in 1 Live room(s)', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 10 : 0, max_count: 5, action_type: 'live_message', action_target: 1, deep_link: '/(tabs)/home', sort_order: 10 },
  { key: 'daily_like_moment', title: 'Like 2 moment(s) of others', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 10 : 0, max_count: 5, action_type: 'like_moment', action_target: 2, deep_link: '/(tabs)/reels', sort_order: 11 },
  { key: 'daily_random_match', title: 'Random Match for 1 time(s)', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 25 : 0, max_count: 2, action_type: 'manual', deep_link: '/search', sort_order: 12 },
  { key: 'daily_watch_live', title: 'Watch Live in Live room for 2 min(s)', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 10 : 0, max_count: 5, action_type: 'watch_live', action_target: 2, deep_link: '/(tabs)/home', sort_order: 13 },
  { key: 'daily_gift_message', title: 'Send gift(s) in message', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 50 : 0, max_count: 1, action_type: 'send_gift', action_target: 1, deep_link: '/profile/messages', sort_order: 14 },
  { key: 'daily_spend_diamonds', title: 'Spend 50 diamonds today', section: 'daily', reward_type: 'diamonds', reward_amount: TASK_REWARDS_ON ? 5 : 0, max_count: 3, action_type: 'spend_diamonds', action_target: 50, deep_link: '/(tabs)/home', sort_order: 15 },
  { key: 'daily_buy_diamonds', title: 'Buy diamonds from wallet', section: 'daily', reward_type: 'diamonds', reward_amount: TASK_REWARDS_ON ? 10 : 0, max_count: 1, action_type: 'buy_diamonds', action_target: 1, deep_link: '/profile/wallet', sort_order: 16 },
  { key: 'daily_top_wheel', title: 'Win 1 time(s) in Top Wheel in Party room (win>spend)', section: 'daily', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 25 : 0, max_count: 2, action_type: 'manual', deep_link: '/(tabs)/home', sort_order: 17 },
  { key: 'monthly_follow', title: 'Be followed by 1 user(s)', section: 'monthly', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 100 : 0, max_count: 5, action_type: 'follow', action_target: 1, deep_link: '/(tabs)/profile', sort_order: 20 },
  { key: 'monthly_topup', title: 'Top up for 1 time(s)', section: 'monthly', reward_type: 'diamonds', reward_amount: TASK_REWARDS_ON ? 20 : 0, max_count: 5, action_type: 'buy_diamonds', action_target: 1, deep_link: '/profile/wallet', sort_order: 21 },
  { key: 'monthly_invite', title: 'Invite 1 new user(s) successfully', section: 'monthly', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 200 : 0, max_count: 5, action_type: 'invite', action_target: 1, deep_link: '/(tabs)/profile', sort_order: 22 },
  { key: 'monthly_lucky_win', title: 'Send 17 Lucky Win', section: 'monthly', reward_type: 'beans', reward_amount: TASK_REWARDS_ON ? 200 : 0, max_count: 5, action_type: 'manual', deep_link: '/profile/messages', sort_order: 23 },
];

async function seedDefaultTasks() {
  for (const task of DEFAULT_TASKS) {
    await Task.findOneAndUpdate(
      { key: task.key },
      {
        $set: {
          title: task.title,
          section: task.section,
          reward_type: task.reward_type,
          reward_amount: task.reward_amount,
          max_count: task.max_count,
          action_type: task.action_type,
          action_target: task.action_target ?? 1,
          deep_link: task.deep_link,
          sort_order: task.sort_order,
          is_active: true,
        },
        $setOnInsert: { key: task.key },
      },
      { upsert: true },
    );
  }
  console.log(
    FREE_PLATFORM_GRANTS_ENABLED
      ? '✅ Default tasks synced (free rewards ON)'
      : '✅ Default tasks synced (free rewards OFF — purchase/earn only)',
  );
}

module.exports = { seedDefaultTasks, DEFAULT_TASKS };