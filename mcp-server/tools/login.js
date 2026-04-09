import { z } from 'zod';
import { login, getCurrentUser, logout } from '../auth.js';

export function registerLogin(server) {
  server.registerTool('login', {
    title: 'MCP 로그인',
    description: '자산관리 시스템에 로그인합니다. 이메일과 비밀번호를 입력하세요. 등록/수정/삭제 등의 작업 전에 반드시 로그인이 필요합니다.',
    inputSchema: z.object({
      email: z.string().describe('사용자 이메일'),
      password: z.string().describe('비밀번호'),
    }),
  }, async (args) => {
    const result = await login(args.email, args.password);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Error: ${result.message}` }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: '로그인 성공',
          user: result.user,
        }, null, 2),
      }],
    };
  });

  server.registerTool('whoami', {
    title: '현재 로그인 정보',
    description: '현재 로그인된 사용자 정보를 확인합니다.',
    inputSchema: z.object({}),
  }, async () => {
    const user = getCurrentUser();
    if (!user) {
      return {
        content: [{ type: 'text', text: '로그인되어 있지 않습니다. login 도구로 로그인해주세요.' }],
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ message: '현재 로그인 정보', user }, null, 2),
      }],
    };
  });

  server.registerTool('logout', {
    title: 'MCP 로그아웃',
    description: '현재 세션에서 로그아웃합니다.',
    inputSchema: z.object({}),
  }, async () => {
    logout();
    return {
      content: [{ type: 'text', text: '로그아웃되었습니다.' }],
    };
  });
}
