package main

import (
	"context"
	"embed"
	"gmzz-club/server"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

//go:embed all:web/dist
var assets embed.FS

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	app, err := server.New(ctx, os.Getenv("DATABASE_URL"), os.Getenv("COOKIE_SECURE") == "true")
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()
	if len(os.Args) == 3 && os.Args[1] == "promote" {
		if err := app.Promote(ctx, os.Args[2]); err != nil {
			log.Fatal(err)
		}
		log.Print("Administrator promoted")
		return
	}
	frontend, _ := fs.Sub(assets, "web/dist")
	port := os.Getenv("PORT")
	if port == "" {
		port = "19080"
	}
	httpServer := &http.Server{Addr: ":" + port, Handler: app.Handler(frontend), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()
	log.Printf("Club service listening on http://localhost:%s", port)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
