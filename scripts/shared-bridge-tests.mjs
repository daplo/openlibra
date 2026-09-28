import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

export async function testSharedBridge(browser, url, server) {
  const bundle = await build({
    stdin: {
      contents: `export {default as init, DocumentEngine} from './apps/web/src/wasm/open_libra_scene_wasm.js'; export {CollaborationClient} from './apps/web/src/editor/collaboration.ts'; export {SharedEditorBridge} from './apps/web/src/editor/shared-editor.ts';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    write: false,
  });
  const page = await browser.newPage();
  const moduleUrl = new URL("__shared_bridge_test.js", url).href;
  await page.route(moduleUrl, (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: bundle.outputFiles[0].text,
    }),
  );
  await page.route(new URL("open_libra_scene_wasm_bg.wasm", url).href, (r) =>
    r.fulfill({
      contentType: "application/wasm",
      body: readFileSync("apps/web/src/wasm/open_libra_scene_wasm_bg.wasm"),
    }),
  );
  await page.goto(url);
  const result = await page.evaluate(
    async ({ moduleUrl, server }) => {
      const { init, DocumentEngine, CollaborationClient, SharedEditorBridge } =
        await import(moduleUrl);
      await init();
      const wait = async (fn) => {
        for (let i = 0; i < 100; i++) {
          if (fn()) return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw Error("bridge condition timeout");
      };
      const post = async (route, body, token) => {
        const r = await fetch(server + route, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
        const v = await r.json();
        if (!r.ok) throw Error(v.error);
        return v;
      };
      const room = await post("/rooms", {});
      const guest = await post(`/rooms/${room.room_id}/join`, {
        invite: room.invite,
      });
      let a, b;
      const ca = new CollaborationClient(
        { server, room: room.room_id, token: room.token, actor: room.actor_id },
        () => a?.sync(),
      );
      const cb = new CollaborationClient(
        {
          server,
          room: room.room_id,
          token: guest.token,
          actor: guest.actor_id,
        },
        () => b?.sync(),
      );
      void ca.connect();
      void cb.connect();
      await wait(() => ca.status === "connected" && cb.status === "connected");
      a = new SharedEditorBridge(ca);
      b = new SharedEditorBridge(cb);
      const settled = async (revision) =>
        wait(
          () =>
            !ca.pending &&
            !cb.pending &&
            ca.state().revision === revision &&
            cb.state().revision === revision,
        );
      try {
        a.engine.begin_transaction();
        const frame = a.engine.add_frame();
        const text = a.engine.add_text_to(frame);
        const vector = a.engine.add_vector_shape("star", frame);
        a.engine.convert_vector_to_path(vector);
        a.engine.add_number_variable("Gap", 12);
        const style = JSON.parse(a.engine.node_json(text)).text;
        a.engine.add_text_style("Body", JSON.stringify(style));
        a.engine.add_document_color("Brand", "#225588");
        const component = a.engine.create_component(frame, "Card");
        const variant = JSON.parse(a.engine.read_model_json()).components[0]
          .variants[0].id;
        a.engine.create_component_instance(component, variant, "");
        a.engine.add_media_asset_node(
          "image",
          "Pixel",
          "image/png",
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNuoAAAAASUVORK5CYII=",
          1,
          1,
          frame,
        );
        a.engine.end_transaction();
        await settled(1);
        const mixed = JSON.parse(cb.engine.document_json());
        if (
          mixed.components.length !== 1 ||
          mixed.media_assets.length !== 1 ||
          mixed.text_styles.length !== 1
        )
          throw Error("mixed transaction lost entities");
        // Intervening remote change during a local gesture causes a retained stale intent.
        a.engine.begin_transaction();
        a.engine.set_node_opacity(frame, 0.5);
        b.engine.rename_node(frame, "Bob's frame");
        await wait(
          () => cb.state().revision === 2 && ca.state().revision === 2,
        );
        a.engine.end_transaction();
        await wait(() => ca.pending?.rejected);
        const staleSaved = JSON.parse(
          localStorage.getItem(
            `open-libra-collaboration-draft:${room.room_id}:${room.actor_id}`,
          ),
        );
        if (!staleSaved?.envelope) throw Error("stale edit was not persisted");
        ca.retry();
        await settled(3);
        if (JSON.parse(b.engine.node_json(frame)).name !== "Bob's frame")
          throw Error("retry overwrote unrelated edit");
        // Own undo preserves another actor's name and reverses only own opacity.
        a.engine.undo();
        await settled(4);
        if (
          JSON.parse(b.engine.node_json(frame)).name !== "Bob's frame" ||
          JSON.parse(b.engine.node_json(frame)).opacity !== 1
        )
          throw Error("undo was not scoped");
        // A same-property conflict must remain rejected even after explicit retry.
        a.engine.begin_transaction();
        a.engine.rename_node(frame, "Alice's frame");
        b.engine.rename_node(frame, "Bob wins first");
        await wait(
          () => ca.state().revision === 5 && cb.state().revision === 5,
        );
        a.engine.end_transaction();
        await wait(() => ca.pending?.rejected);
        ca.retry();
        await wait(() => ca.pending?.rejected);
        if (JSON.parse(b.engine.node_json(frame)).name !== "Bob wins first")
          throw Error("conflict overwrote accepted name");
        ca.discard();
        // A gesture completed after a role downgrade is retained without sending.
        b.engine.begin_transaction();
        b.engine.set_node_opacity(frame, 0.7);
        await post(
          `/rooms/${room.room_id}/participants`,
          { actor_id: guest.actor_id, role: "viewer" },
          room.token,
        );
        await wait(() => cb.role === "viewer");
        b.engine.end_transaction();
        await wait(() => !!cb.pending);
        if (cb.state().revision !== 5)
          throw Error("viewer gesture was accepted");
        cb.discard();
        b.engine.add_rectangle();
        await new Promise((r) => setTimeout(r, 100));
        if (cb.state().revision !== 5)
          throw Error("viewer mutation escaped guard");
        await post(
          `/rooms/${room.room_id}/participants`,
          { actor_id: guest.actor_id, role: "editor" },
          room.token,
        );
        await wait(() => cb.role === "editor");
        const contours = [
          {
            closed: false,
            points: [
              {
                position: [0, 0],
                handle_out: [0.25, 0.5],
                point_type: "smooth",
              },
              { position: [1, 1], point_type: "corner" },
            ],
          },
        ];
        const path = a.engine.add_path(
          JSON.stringify(contours),
          "[50,50,120,80]",
          "",
        );
        await settled(6);
        if (!JSON.parse(b.engine.node_json(path)).vector)
          throw Error("Pen path did not synchronize");
        contours[0].points[0].position = [0.1, 0.2];
        b.engine.update_path(path, JSON.stringify(contours));
        await settled(7);
        if (
          JSON.parse(a.engine.node_json(path)).vector.geometry.contours[0]
            .points[0].position[0] < 0.09
        )
          throw Error("Anchor edit did not synchronize");
        b.engine.undo();
        await settled(8);
        if (
          JSON.parse(a.engine.node_json(path)).vector.geometry.contours[0]
            .points[0].position[0] !== 0
        )
          throw Error("Anchor undo did not synchronize");
        a.engine.begin_transaction();
        const maskContent = a.engine.add_rectangle();
        const maskSource = a.engine.add_vector_shape("ellipse", "");
        const maskGroup = a.engine.mask_nodes(
          JSON.stringify([maskContent, maskSource]),
        );
        a.engine.end_transaction();
        await settled(9);
        if (
          !maskGroup ||
          !JSON.parse(b.engine.node_json(maskSource)).mask_shape
        )
          throw Error("Mask did not synchronize");
        b.engine.release_mask(maskGroup);
        await settled(10);
        if (JSON.parse(a.engine.node_json(maskSource)).mask_shape)
          throw Error("Mask release did not synchronize");
        b.engine.undo();
        await settled(11);
        if (!JSON.parse(a.engine.node_json(maskSource)).mask_shape)
          throw Error("Mask undo did not synchronize");
        // Reconnect replaces the working head, with no local journal contamination.
        const before = ca.engine.document_json();
        const loaded = DocumentEngine.load_json(before);
        loaded.free();
        return {
          mixed: true,
          stale: true,
          scopedUndo: true,
          conflict: true,
          downgrade: true,
          revision: ca.state().revision,
        };
      } finally {
        a.dispose();
        b.dispose();
        ca.close();
        cb.close();
      }
    },
    { moduleUrl, server },
  );
  assert.deepEqual(result, {
    mixed: true,
    stale: true,
    scopedUndo: true,
    conflict: true,
    downgrade: true,
    revision: 11,
  });
  await page.close();
}
