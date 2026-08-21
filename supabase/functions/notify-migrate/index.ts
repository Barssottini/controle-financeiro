// One-off já executado (e-mail de migração enviado em 2026-07-22). Neutralizada.
//
// O identificador do destinatário foi removido desta cópia versionada em
// 21/08/2026: o repositório é público, e nome de usuário de cliente não vai para
// dentro dele. A função implantada ainda traz o comentário original.
//
// Pode ser removida de vez do projeto — não há nada que a chame.
Deno.serve(() => new Response(JSON.stringify({ ok: true, retired: true }), { headers: { "Content-Type": "application/json" } }));
