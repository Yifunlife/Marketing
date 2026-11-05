import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryIdentityMatches} from '../scripts/douyin-safari.mjs';
test('local collection requires the exact factory display name and Douyin identity',()=>{
 assert(factoryIdentityMatches('亦玩游乐设备工厂 抖音号：shanghaiyiwan 关注 10'));
 assert(!factoryIdentityMatches('亦玩游乐玩具工厂 抖音号：85639035334'));
 assert(!factoryIdentityMatches('亦玩游乐设备工厂 抖音号：shanghaiyiwanOTHER'));
 assert(!factoryIdentityMatches('验证码登录'));
});
