import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryIdentityMatches,coverTitleMatches} from '../scripts/douyin-safari.mjs';
test('local collection requires the exact factory display name and Douyin identity',()=>{
 assert(factoryIdentityMatches('亦玩游乐设备工厂 抖音号：shanghaiyiwan 关注 10'));
 assert(!factoryIdentityMatches('亦玩游乐玩具工厂 抖音号：85639035334'));
 assert(!factoryIdentityMatches('亦玩游乐设备工厂 抖音号：shanghaiyiwanOTHER'));
 assert(!factoryIdentityMatches('验证码登录'));
});
test('rendered title whitespace is normalized without accepting different wording',()=>{
 assert(coverTitleMatches('文本 新品\n药品验收机 #乐园','新品 药品验收机  #乐园'));
 assert(!coverTitleMatches('文本 新品药品验收机 #乐园','新品药品验收台 #乐园'));
});
