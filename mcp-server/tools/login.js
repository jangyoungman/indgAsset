import { z } from 'zod';
import { login, getUserFromToken } from '../auth.js';

export function registerLogin(server) {
  server.registerTool('login', {
    title: 'MCP 로그인',
    description: '자산관리 시스템에 로그인합니다. 로그인 성공 시 JWT 토큰이 발급됩니다. 이후 등록/수정/삭제 작업 시 이 토큰을 token 필드에 전달하세요.',
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
          message: '로그인 성공. 아래 token을 등록/수정/삭제 작업 시 전달하세요.',
          user: result.user,
          token: result.token,
        }, null, 2),
      }],
    };
  });

  server.registerTool('whoami', {
    title: '현재 로그인 정보',
    description: '토큰으로 현재 로그인된 사용자 정보를 확인합니다.',
    inputSchema: z.object({
      token: z.string().describe('로그인 시 발급받은 JWT 토큰'),
    }),
  }, async (args) => {
    const user = getUserFromToken(args.token);
    if (!user) {
      return {
        content: [{ type: 'text', text: '유효하지 않은 토큰입니다. login 도구로 다시 로그인해주세요.' }],
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ message: '현재 로그인 정보', user: { id: user.id, email: user.email, name: user.name, role: user.role } }, null, 2),
      }],
    };
  });

  server.registerTool('logout', {
    title: 'MCP 로그아웃',
    description: 'JWT 토큰 기반이므로 클라이언트에서 토큰을 폐기하면 됩니다.',
    inputSchema: z.object({}),
  }, async () => {
    return {
      content: [{ type: 'text', text: '로그아웃: 보유한 토큰을 폐기해주세요. (JWT 기반이므로 서버 측 세션 없음)' }],
    };
  });
}
